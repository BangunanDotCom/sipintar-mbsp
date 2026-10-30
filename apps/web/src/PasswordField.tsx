import React from "react";
import { Eye, EyeOff } from "lucide-react";
import "./password-field.css";

export const PasswordField = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { id: string }
>(function PasswordField({ id, disabled, ...props }, ref) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="auth-password-field">
      <input
        {...props}
        id={id}
        ref={ref}
        disabled={disabled}
        type={visible ? "text" : "password"}
      />
      <button
        className="password-visibility-toggle"
        type="button"
        disabled={disabled}
        aria-label={
          visible ? "Sembunyikan kata laluan" : "Tunjukkan kata laluan"
        }
        aria-controls={id}
        aria-pressed={visible}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? (
          <EyeOff size={19} aria-hidden="true" />
        ) : (
          <Eye size={19} aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
