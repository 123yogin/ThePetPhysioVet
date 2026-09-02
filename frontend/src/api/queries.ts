import { http } from '../lib/http';
import { QueryThread, QueryMessage } from '../lib/types';

export async function fetchQueryInbox(): Promise<{ results: QueryThread[] }> {
  return http('/queries/inbox');
}

export async function fetchPetQueries(petId: string): Promise<QueryThread> {
  return http<QueryThread>(`/pets/${petId}/queries`);
}

export async function sendQueryMessage(petId: string, formData: FormData): Promise<QueryMessage> {
  return http<QueryMessage>(`/pets/${petId}/queries`, {
    method: 'POST',
    data: formData,
  });
}
