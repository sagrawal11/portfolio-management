import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <LoginForm />
    </main>
  );
}
