import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function SetPassword({ title, onDone }: { title?: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setErrorMessage('Passwords do not match.');
      setStatus('error');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters.');
      setStatus('error');
      return;
    }
    setStatus('saving');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErrorMessage(error.message);
      setStatus('error');
    } else {
      onDone();
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>{title ?? 'Set a password'}</h1>
        <form onSubmit={handleSubmit}>
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <label htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <button type="submit" disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving...' : 'Save password'}
          </button>
          {status === 'error' && <p className="error-text">{errorMessage}</p>}
        </form>
      </div>
    </div>
  );
}
