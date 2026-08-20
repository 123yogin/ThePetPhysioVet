import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/queryClient';
import { FlashProvider } from './lib/flash';

import { RoleLanding } from './components/RoleLanding';
import { RequireAuth } from './components/RequireAuth';
import { AppShell } from './components/AppShell';
import { OwnerShell } from './components/OwnerShell';
import { ErrorBoundary } from './components/ErrorBoundary';

import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { PatientsScreen } from './screens/PatientsScreen';
import { PetDetailScreen } from './screens/PetDetailScreen';
import { PetFormScreen } from './screens/PetFormScreen';
import { AppointmentsScreen } from './screens/AppointmentsScreen';
import { CreateScreen } from './screens/CreateScreen';
import { RescheduleScreen } from './screens/RescheduleScreen';
import { ShareScreen } from './screens/ShareScreen';
import { InvoiceListScreen } from './screens/InvoiceListScreen';
import { InvoiceDetailScreen } from './screens/InvoiceDetailScreen';
import { InvoiceFormScreen } from './screens/InvoiceFormScreen';
import { RevenueScreen } from './screens/RevenueScreen';
import { QueryInboxScreen } from './screens/QueryInboxScreen';
import { NotificationsSettingsScreen } from './screens/NotificationsSettingsScreen';
import { ProfileScreen } from './screens/ProfileScreen';

import { OwnerHomeScreen } from './screens/OwnerHomeScreen';
import { OwnerPetDetailScreen } from './screens/OwnerPetDetailScreen';
import { OwnerAppointmentsScreen } from './screens/OwnerAppointmentsScreen';
import { OwnerBillingScreen } from './screens/OwnerBillingScreen';

export const AppRoutes: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <FlashProvider>
        <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/" element={<RoleLanding />} />

            {/* Doctor Routes */}
            <Route
              element={
                <RequireAuth allowedRoles={['DOCTOR']}>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/dashboard" element={<DashboardScreen />} />
              <Route path="/patients" element={<PatientsScreen />} />
              <Route path="/patients/new" element={<PetFormScreen />} />
              <Route path="/patients/:id" element={<PetDetailScreen />} />
              <Route path="/appointments" element={<AppointmentsScreen />} />
              <Route path="/appointments/new" element={<CreateScreen />} />
              <Route path="/appointments/:id/reschedule" element={<RescheduleScreen />} />
              <Route path="/appointments/:id/share" element={<ShareScreen />} />
              <Route path="/invoices" element={<InvoiceListScreen />} />
              <Route path="/invoices/new" element={<InvoiceFormScreen />} />
              <Route path="/invoices/:id" element={<InvoiceDetailScreen />} />
              <Route path="/revenue" element={<RevenueScreen />} />
              <Route path="/queries" element={<QueryInboxScreen />} />
              <Route path="/notifications-settings" element={<NotificationsSettingsScreen />} />
              <Route path="/profile" element={<ProfileScreen />} />
            </Route>

            {/* Owner Routes */}
            <Route
              element={
                <RequireAuth allowedRoles={['OWNER']}>
                  <OwnerShell />
                </RequireAuth>
              }
            >
              <Route path="/owner/home" element={<OwnerHomeScreen />} />
              <Route path="/owner/pets/:id" element={<OwnerPetDetailScreen />} />
              <Route path="/owner/appointments" element={<OwnerAppointmentsScreen />} />
              <Route path="/owner/billing" element={<OwnerBillingScreen />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </ErrorBoundary>
      </FlashProvider>
    </QueryClientProvider>
  );
};
