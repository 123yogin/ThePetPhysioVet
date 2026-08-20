import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchPets } from '../api/pets';

export const PatientsScreen: React.FC = () => {
  const [search, setSearch] = useState('');
  const { data: pets, isLoading, isError, refetch } = useQuery({
    queryKey: ['pets', search],
    queryFn: () => fetchPets(search),
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Patients Directory</h1>
          <p className="page-sub">Clinical profiles, medical records, and rehab plans</p>
        </div>
        <Link to="/patients/new" className="btn btn-primary">
          + Add New Patient
        </Link>
      </div>

      <div className="glass-card" style={{ marginBottom: '24px' }}>
        <div className="filter-bar" style={{ margin: 0 }}>
          <div style={{ flex: 1 }}>
            <input
              type="text"
              className="input-glass"
              placeholder="Search by pet name, breed, or owner phone/name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {search && (
            <button onClick={() => setSearch('')} className="btn btn-ghost btn-sm">
              Clear
            </button>
          )}
        </div>
      </div>

      {isError && (
        <div className="alert alert-danger">
          Could not load patients list.{' '}
          <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: 'var(--brown-500)' }}>Loading patients...</p>
      ) : !pets || pets.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--brown-500)', margin: 0 }}>No patients found matching your search.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Patient Name</th>
                <th>Species / Breed</th>
                <th>Owner Name</th>
                <th>Phone</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pets.map((pet) => (
                <tr key={pet.id}>
                  <td style={{ fontWeight: 700 }}>
                    <Link to={`/patients/${pet.id}`} className="table-link">
                      🐕 {pet.name}
                    </Link>
                  </td>
                  <td>{pet.pet_type || pet.species} {pet.breed ? `(${pet.breed})` : ''}</td>
                  <td>{pet.owner_name}</td>
                  <td>{pet.owner_phone}</td>
                  <td>
                    <Link to={`/patients/${pet.id}`} className="btn btn-secondary btn-sm">
                      Clinical Profile &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
