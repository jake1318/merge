import React, { KeyboardEvent } from "react";
import "../styles/components/SearchBar.scss";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  isSearching?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = "Search",
  isSearching = false,
}) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isSearching && value.trim()) {
      onSubmit();
    }
  };

  const handleSearch = () => {
    if (!isSearching && value.trim()) {
      onSubmit();
    }
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        className="w-full px-3 py-2 pl-10 pr-16 rounded bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          fill="currentColor"
          className="text-gray-400"
          viewBox="0 0 16 16"
        >
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
        </svg>
      </div>
      <button
        className={`absolute right-3 top-1/2 transform -translate-y-1/2 px-3 py-1 rounded ${
          value.trim() && !isSearching
            ? "bg-blue-600 hover:bg-blue-700"
            : "bg-gray-700 cursor-not-allowed"
        } text-white text-sm`}
        onClick={handleSearch}
        disabled={!value.trim() || isSearching}
      >
        {isSearching ? (
          <span className="flex items-center">
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Searching
          </span>
        ) : (
          "Search"
        )}
      </button>
    </div>
  );
};

export default SearchBar;
