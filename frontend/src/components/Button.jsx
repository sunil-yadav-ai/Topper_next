export default function Button({
  children,
  className = "",
  variant = "primary",
  as: Component = "button",
  ...props
}) {
  const variants = {
    primary: "ed-action-primary",
    secondary: "ed-action-secondary",
  };

  return (
    <Component
      className={`inline-flex min-h-10 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}
