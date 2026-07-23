import type { ReactNode } from "react";

// Reusable .field wrapper matching the Django `{% for field in form %}` loop:
//   <div class="field {extra}">
//     <label for={id}>{label}:</label>   (Django label_suffix ":")
//     {optional .field-hint help text}
//     {widget}
//     {optional .errorlist}
//   </div>
export interface FieldProps {
  label: string;
  htmlFor: string;
  extra?: string; // e.g. "full"
  help?: string; // rendered as .field-hint above the widget (create screen)
  errors?: string[];
  children: ReactNode;
}

export default function Field({ label, htmlFor, extra, help, errors, children }: FieldProps) {
  const className = extra ? `field ${extra}` : "field";
  return (
    <div className={className}>
      <label htmlFor={htmlFor}>{label}:</label>
      {help ? <p className="field-hint">{help}</p> : null}
      {children}
      {errors && errors.length > 0 ? (
        <ul className="errorlist">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
