const Input = ({
  label = '',
  name = '',
  type = 'text',
  className = '',
  inputClassName = '',
  isRequired = true,
  placeholder = '',
  value = '',
  onChange = () => {},
}) => {
  return (
    <div className="">
      {label && (
        <label htmlFor={name} className="block text-sm font-medium text-gray-800 ml-1 ">
          {label}
        </label>
      )}
      <input
        type={type}
        id={name}
        className={`bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-purple-500 block  p-2.5 ${className} ${inputClassName}`}
        placeholder={placeholder}
        required={isRequired}
        value={value}
        onChange={onChange}
      />
    </div>
  );
};

export default Input;
