const Button = ({
    label = 'Button',
    type = 'button',
    className = '',
    disabled = false,
    onClick = () => {},
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition duration-200 hover:translate-y-[-1px] hover:shadow-xl hover:shadow-violet-500/25 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-violet-500/30 ${className}`}
      disabled={disabled}
    >
      {label}
    </button>
  );
};

export default Button;
