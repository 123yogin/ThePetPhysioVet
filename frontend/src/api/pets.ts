import { http } from '../lib/http';
import { Pet } from '../lib/types';

export async function fetchPets(search?: string): Promise<Pet[]> {
  const query = search ? `?q=${encodeURIComponent(search)}` : '';
  return http<Pet[]>(`/pets${query}`);
}

export async function fetchPetDetail(id: string): Promise<Pet> {
  return http<Pet>(`/pets/${id}`);
}

export async function createPet(formData: FormData): Promise<Pet> {
  return http<Pet>('/pets', {
    method: 'POST',
    data: formData,
  });
}
