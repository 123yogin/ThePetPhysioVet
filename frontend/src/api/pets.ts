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

/** PATCH /pets/{id} with only a new photo (multipart). */
export async function updatePetPhoto(id: string, photo: File): Promise<Pet> {
  const formData = new FormData();
  formData.append('photo', photo);
  return http<Pet>(`/pets/${id}`, {
    method: 'PATCH',
    data: formData,
  });
}
