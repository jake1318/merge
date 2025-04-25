import React from "react";

import "../styles/components/SearchBar.scss";

interface SearchBarProps {
  value: string;
  placeholder?: string;
  isSearching?: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  onSubmit: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({
  value,
  placeholder = "",
  isSearching = false,
  onChange,
  onSubmit,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onSubmit();
    }
  };

  const handleClear = () => {
    if (!isSearching) {
      // Clear the search input
      if (onChange) {
        const event = {
          target: { value: "" },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(event);
      }
    }
  };

  return (
    <div className="search-bar">
      <div className="search-icon">
        {/* Magnifying glass SVG icon */}
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.414-1.414l-3.85-3.85zM12 6.5A5.5 5.5 0 111 6.5a5.5 5.5 0 0111 0z" />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        onKeyDown={handleKeyDown}
      />
      {value.trim() !== "" && !isSearching && (
        <button type="button" className="clear-button" onClick={handleClear}>
          ×
        </button>
      )}
    </div>
  );
};

export default SearchBar;
