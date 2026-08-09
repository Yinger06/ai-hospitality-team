import { randomUUID } from 'node:crypto'
import type {
  AgentActivation,
  AgentContext,
  AgentContribution,
  AgentId,
  GuestIssue,
  MemoryCandidate,
  ModelCallTrace,
  OrchestrationResult,
  OrchestrationStreamEvent,
  RouteDecision,
  RuntimeMode,
  Severity,
  SpecialistAgentId,
} from '../../src/domain/types.js'
import { RequestMemoryRepository } from '../data/memoryRepository.js'
import { retrievePropertyKnowledge } from '../data/propertyKnowledge.js'
import { unresolvedReviewPolicy } from '../policy/reviewPolicy.js'
import { assertNoUnauthorisedActionClaim, assessSafety } from '../policy/safety.js'
import type { ModelRuntime } from '../runtime/modelRuntime.js'
import { ModelRuntimeError } from '../runtime/modelRuntime.js'
import type { RoutePlan, SpecialistPlan } from './contracts.js'
import { validateRoutePlan, validateSpecialistPlan, validateSynthesisPlan } from './contracts.js'
import { selectModel } from './modelRouter.js'
import { routeSchema, specialistSchema, synthesisSchema } from './modelSchemas.js'
import {
  headButlerSystemPrompt,
  routeInput,
  specialistInput,
  specialistSystemPrompt,
  synthesisInput,
  synthesisSystemPrompt,
} from './prompts.js'

const specialistOrder: SpecialistAgentId[] = [
  'guest-memory', 'front-desk', 'guest-experience', 'local-guide', 'problem-solver',
]

const tasks: Record<AgentId, string> = {
  'head-butler': 'Interpret context and select only relevant specialists',
  'guest-memory': 'Validate and save useful guest context',
  'front-desk': 'Answer from verified property information',
  'guest-experience': 'Shape contextual hospitality care',
  'local-guide': 'Build a grounded local suggestion',
  'problem-solver': 'Assess severity, recovery, and escalation',
}

const severityRank: Record<Severity, number> = { low: 0, medium: 1, high: 2, urgent: 3 }
const maxSeverity = (left: Severity, right: Severity) =>
  severityRank[left] >= severityRank[right] ? left : right

const uniqueCandidates = (values: MemoryCandidate[]) => values.filter((candidate, index) =>
  values.findIndex((item) => item.category === candidate.category && item.value.toLowerCase() === candidate.value.toLowerCase()) === index)

const ensureSelection = (route: RoutePlan, agentId: SpecialistAgentId, reason: string) => {
  if (!route.selections.some((selection) => selection.agentId === agentId)) {
    route.selections.push({ agentId, reason })
  }
}

const normaliseRoute = (context: AgentContext, plan: RoutePlan, safetySeverity: Severity) => {
  if (context.stage !== 'review-follow-up' && context.eventType !== 'review-event') {
    plan.intents = plan.intents.filter((intent) => intent !== 'review')
  }
  plan.severity = maxSeverity(plan.severity, safetySeverity)
  if (plan.memoryCandidates.length) {
    if (!plan.intents.includes('memory-update')) plan.intents.push('memory-update')
    ensureSelection(plan, 'guest-memory', 'Useful durable guest context was identified.')
  }
  if (safetySeverity === 'urgent') {
    if (!plan.intents.includes('problem')) plan.intents.push('problem')
    ensureSelection(plan, 'problem-solver', 'A deterministic life-safety rule requires immediate review.')
    if (!plan.knowledgeKeys.includes('emergency-contact')) plan.knowledgeKeys.push('emergency-contact')
  }
  if (context.eventType === 'booking-event') {
    ensureSelection(plan, 'guest-experience', 'A confirmed booking needs a welcome.')
  }
  if (context.eventType === 'review-event') {
    if (!plan.intents.includes('review')) plan.intents.push('review')
    ensureSelection(plan, 'guest-experience', 'A review event needs a relationship response.')
  }
  if (!plan.selections.length) {
    ensureSelection(plan, 'guest-experience', 'A coherent hospitality reply is still appropriate.')
  }
  plan.selections.sort((left, right) =>
    specialistOrder.indexOf(left.agentId) - specialistOrder.indexOf(right.agentId))
  return plan
}

const routeDecision = (traceId: string, route: RoutePlan): RouteDecision => ({
  traceId,
  intents: route.intents,
  sentiment: route.sentiment,
  severity: route.severity,
  rationale: route.rationale,
  knowledgeKeys: route.knowledgeKeys,
  activations: [
    {
      agentId: 'head-butler',
      status: 'done',
      task: tasks['head-butler'],
      result: `Selected ${route.selections.length} specialist${route.selections.length === 1 ? '' : 's'}`,
    },
    ...specialistOrder.map((agentId): AgentActivation => {
      const selection = route.selections.find((item) => item.agentId === agentId)
      return {
        agentId,
        status: selection ? 'queued' : 'skipped',
        task: tasks[agentId],
        selectedBecause: selection?.reason,
      }
    }),
  ],
})

const modelTrace = (
  id: string,
  task: ModelCallTrace['task'],
  agentId: AgentId,
  choice: ReturnType<typeof selectModel>,
  response: { durationMs: number; usage: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number } },
  runtimeMode: RuntimeMode,
): ModelCallTrace => ({
  id,
  task,
  agentId,
  model: runtimeMode === 'test-fixture' ? 'fixture' : choice.model,
  tier: choice.tier,
  reason: choice.reason,
  durationMs: response.durationMs,
  status: 'completed',
  ...response.usage,
})

const toContribution = (
  plan: SpecialistPlan,
  traceId: string,
  index: number,
): AgentContribution => {
  const issue: GuestIssue | undefined = plan.issue ? {
    id: `issue-${traceId}-${index + 1}`,
    summary: plan.issue.summary,
    severity: plan.issue.severity,
    status: severityRank[plan.issue.severity] >= severityRank.medium ? 'escalated' : 'open',
    openedAt: new Date().toISOString(),
  } : undefined

  const escalation = plan.escalation ?? (issue?.status === 'escalated' ? {
    title: issue.summary,
    detail: 'Human review is required. No external action has been taken automatically.',
    severity: issue.severity,
  } : undefined)

  return {
    agentId: plan.agentId,
    intent: plan.intent,
    summary: plan.summary,
    responseParts: plan.responseParts,
    issue,
    escalation,
  }
}

const fallbackGuestResponse = (context: AgentContext) =>
  `I’m sorry, ${context.guest.name.split(' ')[0]} — I can’t safely complete that request right now. I’m asking ${context.property.hostName} to review your message. If this is urgent, please call ${context.property.emergencyPhone}.`

export interface AiOrchestratorDependencies {
  runtime: ModelRuntime
  emit?: (event: OrchestrationStreamEvent) => void
}

export const orchestrateWithAi = async (
  context: AgentContext,
  { runtime, emit = () => undefined }: AiOrchestratorDependencies,
): Promise<OrchestrationResult> => {
  const startedAt = Date.now()
  const startedAtIso = new Date(startedAt).toISOString()
  const traceId = `trace-${randomUUID()}`
  const traces: ModelCallTrace[] = []
  const safety = assessSafety(context)
  const reviewPolicy = unresolvedReviewPolicy(context)
  const runtimeModel = (model: string) => runtime.mode === 'test-fixture' ? 'fixture' : model

  try {
    const routeChoice = selectModel('routing', 'head-butler')
    const routeResponse = await runtime.run({
      task: 'routing',
      agentId: 'head-butler',
      ...routeChoice,
      systemPrompt: headButlerSystemPrompt,
      input: routeInput(context),
      schema: routeSchema,
      validate: validateRoutePlan,
    })
    traces.push(modelTrace(`call-${traceId}-route`, 'routing', 'head-butler', routeChoice, routeResponse, runtime.mode))
    const route = normaliseRoute(context, routeResponse.data, safety.severity)
    const decision = routeDecision(traceId, route)
    emit({ type: 'route', decision })

    const groundedFacts = retrievePropertyKnowledge(context.property, route.knowledgeKeys)
    const specialistPlans: SpecialistPlan[] = []

    const modelSelections = route.selections.filter((selection) => selection.agentId !== 'guest-memory')
    route.selections.forEach((selection) => emit({ type: 'agent-start', agentId: selection.agentId }))

    if (route.selections.some((selection) => selection.agentId === 'guest-memory')) {
      const memoryPlan: SpecialistPlan = {
        agentId: 'guest-memory',
        intent: 'memory-update',
        summary: `Validated ${route.memoryCandidates.length} useful memory update${route.memoryCandidates.length === 1 ? '' : 's'}`,
        responseParts: [],
        factsUsed: [],
        memoryCandidates: route.memoryCandidates,
      }
      specialistPlans.push(memoryPlan)
      emit({
        type: 'agent-done',
        activation: {
          agentId: 'guest-memory',
          status: 'done',
          task: tasks['guest-memory'],
          result: memoryPlan.summary,
          selectedBecause: route.selections.find((selection) => selection.agentId === 'guest-memory')?.reason,
          model: runtimeModel(routeChoice.model),
        },
      })
    }

    await Promise.all(modelSelections.map(async (selection, index) => {
      const choice = selectModel('specialist', selection.agentId, { severity: route.severity })
      const response = await runtime.run({
        task: 'specialist',
        agentId: selection.agentId,
        ...choice,
        systemPrompt: specialistSystemPrompt(selection.agentId),
        input: specialistInput(context, selection.agentId, route, groundedFacts, safety),
        schema: specialistSchema,
        validate: validateSpecialistPlan,
      })
      if (response.data.agentId !== selection.agentId) {
        throw new ModelRuntimeError('malformed-output', 'A specialist returned the wrong identity.')
      }
      specialistPlans.push(response.data)
      traces.push(modelTrace(`call-${traceId}-specialist-${index + 1}`, 'specialist', selection.agentId, choice, response, runtime.mode))
      emit({
        type: 'agent-done',
        activation: {
          agentId: selection.agentId,
          status: 'done',
          task: tasks[selection.agentId],
          result: response.data.summary,
          selectedBecause: selection.reason,
          model: runtimeModel(choice.model),
        },
      })
    }))

    specialistPlans.sort((left, right) =>
      specialistOrder.indexOf(left.agentId) - specialistOrder.indexOf(right.agentId))

    const allCandidates = uniqueCandidates(route.memoryCandidates)
    const scope = {
      propertyId: context.property.id,
      bookingId: context.guest.bookingCode,
      guestId: context.guest.id,
    }
    const memoryRepository = new RequestMemoryRepository(scope, context.memory)
    let memory = await memoryRepository.apply(scope, allCandidates, route.sentiment)
    const contributions = specialistPlans.map((plan, index) => toContribution(plan, traceId, index))
    for (const contribution of contributions) {
      if (contribution.issue) memory = { ...memory, issues: [...memory.issues, contribution.issue] }
    }

    const responsePlans = specialistPlans.filter((plan) => plan.responseParts.length)
    let finalResponse = responsePlans.flatMap((plan) => plan.responseParts).join(' ')
    if (responsePlans.length > 1) {
      const choice = selectModel('synthesis', 'head-butler', {
        specialistCount: responsePlans.length,
        severity: route.severity,
      })
      const synthesis = await runtime.run({
        task: 'synthesis',
        agentId: 'head-butler',
        ...choice,
        systemPrompt: synthesisSystemPrompt,
        input: synthesisInput(context, route, responsePlans, groundedFacts),
        schema: synthesisSchema,
        validate: validateSynthesisPlan,
      })
      traces.push(modelTrace(`call-${traceId}-synthesis`, 'synthesis', 'head-butler', choice, synthesis, runtime.mode))
      finalResponse = synthesis.data.finalResponse
    }

    if (safety.urgentGuestGuidance && !finalResponse.includes(safety.urgentGuestGuidance)) {
      finalResponse = `${safety.urgentGuestGuidance} ${finalResponse}`.trim()
    }
    if (reviewPolicy) finalResponse = reviewPolicy.response
    if (!finalResponse) finalResponse = fallbackGuestResponse(context)
    assertNoUnauthorisedActionClaim(finalResponse)

    const safetyEscalation = safety.escalation
    const escalation = safetyEscalation ?? contributions.find((item) => item.escalation)?.escalation
    decision.activations = decision.activations.map((activation) => {
      if (activation.status === 'skipped' || activation.agentId === 'head-butler') return activation
      const contribution = contributions.find((item) => item.agentId === activation.agentId)
      return {
        ...activation,
        status: 'done',
        result: contribution?.summary ?? activation.result ?? 'Completed',
        model: activation.agentId === 'guest-memory'
          ? runtimeModel(routeChoice.model)
          : traces.find((trace) => trace.agentId === activation.agentId)?.model,
      }
    })

    const result: OrchestrationResult = {
      decision,
      contributions,
      finalResponse,
      memory,
      escalation,
      trace: {
        mode: runtime.mode,
        startedAt: startedAtIso,
        durationMs: Date.now() - startedAt,
        modelCalls: traces,
        groundedKnowledge: groundedFacts.map((fact) => fact.key),
        memoryChanges: allCandidates,
        safetyRulesApplied: safety.rules,
        policyRulesApplied: reviewPolicy ? [reviewPolicy.rule] : [],
      },
    }
    emit({ type: 'final', result })
    return result
  } catch (error) {
    if (error instanceof ModelRuntimeError) throw error
    throw new ModelRuntimeError('malformed-output', 'The AI response failed a safety or data validation check.')
  }
}
