import React from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '../api/auth';
import { getAccessToken } from '../lib/tokens';

export const RoleLanding: React.FC = () => {
  const token = getAccessToken();
  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: !!token,
    retry: false,
  });

  if (!token) return <Navigate to="/login" replace />;
  if (isLoading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;

  if (user?.role === 'OWNER') {
    return <Navigate to="/owner/home" replace />;
  }

  return <Navigate to="/dashboard" replace />;
};
