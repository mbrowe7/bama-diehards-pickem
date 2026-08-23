import { useState } from 'react';
import { SetPassword } from './SetPassword';

export function Account() {
  const [changingPassword, setChangingPassword] = useState(false);

  if (changingPassword) {
    return <SetPassword title="Change password" onDone={() => setChangingPassword(false)} />;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Account</h1>
      </div>
      <button type="button" onClick={() => setChangingPassword(true)}>
        Change password
      </button>
    </div>
  );
}
