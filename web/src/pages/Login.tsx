import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'error' | 'reset-sent'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setErrorMessage(error.message);
      setStatus('error');
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setErrorMessage('Enter your email above first, then click "Forgot password?".');
      setStatus('error');
      return;
    }
    setStatus('sending');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      setErrorMessage(error.message);
      setStatus('error');
    } else {
      setStatus('reset-sent');
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Bama Diehards Pick 'Em</h1>
        {status === 'reset-sent' ? (
          <p>Check your email for a link to set your password.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" disabled={status === 'sending'}>
              {status === 'sending' ? 'Signing in...' : 'Sign in'}
            </button>
            <button type="button" className="link-button" onClick={handleForgotPassword}>
              Forgot password? / First time here?
            </button>
            {status === 'error' && <p className="error-text">{errorMessage}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
