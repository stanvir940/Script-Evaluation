import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { clearError, login } from '../features/auth/authSlice';

const loginSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, loading, error } = useAppSelector((s) => s.auth);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    return () => {
      dispatch(clearError());
    };
  }, [dispatch]);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (data: LoginForm) => {
    const result = await dispatch(login(data));
    if (login.fulfilled.match(result)) {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md panel p-8">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-primary">DASEMS</h1>
          <p className="text-sm text-text-muted mt-2">
            Digital Admission Script Evaluation &amp; Moderation System
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="employeeId" className="block text-base font-medium text-text-primary mb-1">
              Employee ID
            </label>
            <input id="employeeId" type="text" className="input-field" {...register('employeeId')} />
            {errors.employeeId && (
              <p className="text-sm text-danger mt-1">{errors.employeeId.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-base font-medium text-text-primary mb-1">
              Password
            </label>
            <input id="password" type="password" className="input-field" {...register('password')} />
            {errors.password && (
              <p className="text-sm text-danger mt-1">{errors.password.message}</p>
            )}
          </div>

          {(error || errors.root) && (
            <p className="text-sm text-danger bg-danger-bg px-3 py-2 border border-danger/20">
              {error || 'Invalid credentials'}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-xs text-text-muted mt-6 text-center">Demo: ADMIN001 / password123</p>
      </div>
    </div>
  );
}
