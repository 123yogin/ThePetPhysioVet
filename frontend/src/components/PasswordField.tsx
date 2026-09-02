import React, { useId, useState } from 'react';
import { Icon } from './Icon';

interface PasswordFieldProps {
  /** Optional — one is generated if omitted, so the label always has a target. */
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** "current-password" when signing in, "new-password" when choosing one.
   *  Getting this wrong makes password managers offer the wrong thing. */
  autoComplete?: 'current-password' | 'new-password';
  required?: boolean;
  minLength?: number;
}

/**
 * A password input with a show/hide toggle.
 *
 * One component rather than a toggle copied into each form: there are four
 * password inputs in this app (sign in, owner registration, and both fields
 * of the reset screen), and a copied control is one that drifts — this
 * codebase already lost booking entirely to three forms that each invented
 * their own version of the same thing.
 *
 * Reveal matters most where a password is being *chosen*, not recalled: on
 * registration and reset the user is typing a string they have never typed
 * before and cannot verify, and a typo there locks them out of an account
 * holding clinical records.
 */
export const PasswordField: React.FC<PasswordFieldProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete = 'current-password',
  required,
  minLength,
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-field">
        <input
          id={inputId}
          // The whole point of the control. Note the input is NOT remounted
          // when this flips — React reuses the same DOM node, so the caret
          // position and any password-manager binding survive the toggle.
          type={revealed ? 'text' : 'password'}
          className="input-glass"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          // Revealed text is still a password: keep it out of autocorrect,
          // autocapitalise and spellcheck, all of which activate on
          // type="text" and would mangle or leak what is typed.
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="password-toggle"
          // type="button" above is load-bearing: the default is "submit",
          // so without it revealing the password submits the form.
          onClick={() => setRevealed((r) => !r)}
          // Keeps the caret in the input on a mouse click, so the user can
          // carry on typing. Enter/Space don't fire mousedown, so keyboard
          // activation is unaffected.
          onMouseDown={(e) => e.preventDefault()}
          aria-pressed={revealed}
          aria-controls={inputId}
        >
          <Icon
            name={revealed ? 'eyeOff' : 'eye'}
            size={18}
            label={revealed ? 'Hide password' : 'Show password'}
          />
        </button>
      </div>
    </div>
  );
};
