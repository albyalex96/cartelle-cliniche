import type { ReactNode } from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';

interface FormFieldProps {
  label: ReactNode;
  htmlFor?: string;
  error?: string;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function FormField({ label, htmlFor, error, description, className, children }: FormFieldProps) {
  return (
    <Field data-invalid={error ? true : undefined} className={className}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
