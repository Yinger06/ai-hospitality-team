import type { GuestMemory, MemoryCandidate, Sentiment } from '../../src/domain/types.js'

export interface MemoryScope {
  propertyId: string
  bookingId: string
  guestId: string
}

export interface GuestMemoryRepository {
  read(scope: MemoryScope): Promise<GuestMemory>
  apply(scope: MemoryScope, candidates: MemoryCandidate[], sentiment: Sentiment): Promise<GuestMemory>
}

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))]

// Request-scoped transitional adapter. A durable implementation can replace it without changing orchestration.
export class RequestMemoryRepository implements GuestMemoryRepository {
  constructor(
    private readonly expectedScope: MemoryScope,
    private memory: GuestMemory,
  ) {}

  private assertScope(scope: MemoryScope) {
    if (
      scope.propertyId !== this.expectedScope.propertyId ||
      scope.bookingId !== this.expectedScope.bookingId ||
      scope.guestId !== this.expectedScope.guestId
    ) {
      throw new Error('Guest memory scope mismatch')
    }
  }

  async read(scope: MemoryScope) {
    this.assertScope(scope)
    return structuredClone(this.memory)
  }

  async apply(scope: MemoryScope, candidates: MemoryCandidate[], sentiment: Sentiment) {
    this.assertScope(scope)
    const additions = (category: MemoryCandidate['category']) =>
      candidates.filter((candidate) => candidate.category === category).map((candidate) => candidate.value)

    this.memory = {
      ...this.memory,
      preferences: unique([...this.memory.preferences, ...additions('preference')]),
      visitedPlaces: unique([...this.memory.visitedPlaces, ...additions('visited-place')]),
      futurePlans: unique([...this.memory.futurePlans, ...additions('future-plan')]),
      importantRequests: unique([...this.memory.importantRequests, ...additions('important-request')]),
      conversationFacts: unique([
        ...this.memory.conversationFacts,
        ...additions('conversation-fact'),
      ]).slice(-20),
      sentimentHistory: [...this.memory.sentimentHistory, sentiment].slice(-24),
    }
    return structuredClone(this.memory)
  }
}
