import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  // `text-white` di sini aman: latarnya `bg-brand` yang cukup gelap.
  primary: 'bg-brand text-white hover:bg-brand-hover',
  ghost: 'border border-line bg-surface text-ink hover:bg-muted',
  danger: 'bg-danger text-white hover:opacity-90',
}

/**
 * Tombol standar.
 *
 * Tingginya sengaja `min-h-touch` (44px) — di HP, target sentuh di bawah itu
 * susah kena. Di layar lebar `md:min-h-0` biar nggak keliatan kegedean.
 */
export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-touch items-center justify-center rounded-card px-4 py-2 text-sm font-medium transition-hikari disabled:opacity-50 md:min-h-0 ${VARIANT[variant]} ${className}`}
    />
  )
}
