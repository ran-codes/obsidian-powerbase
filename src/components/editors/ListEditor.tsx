import React, { useState, useRef, useEffect, useMemo } from 'react';

interface ListEditorProps {
	currentValues: string[];
	allColumnValues: string[];
	isTagColumn?: boolean;
	onAdd: (value: string) => void;
	onCancel: () => void;
}

/**
 * Simple inline input with dropdown suggestions for list/tag columns.
 * Matches vanilla Bases UX.
 */
export function ListEditor({
	currentValues,
	allColumnValues,
	isTagColumn,
	onAdd,
	onCancel,
}: ListEditorProps) {
	const [inputValue, setInputValue] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	// Focus on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Filter suggestions: show values not already in current, filtered by input
	const suggestions = useMemo(() => {
		const currentSet = new Set(currentValues.map(v => v.toLowerCase()));
		const filtered = allColumnValues
			.filter(v => !currentSet.has(v.toLowerCase()))
			.filter(v => !inputValue || v.toLowerCase().includes(inputValue.toLowerCase()));
		filtered.sort((a, b) => a.localeCompare(b));
		return filtered;
	}, [allColumnValues, currentValues, inputValue]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && inputValue.trim()) {
			e.preventDefault();
			onAdd(inputValue.trim());
			setInputValue('');
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		}
	};

	const handleSuggestionClick = (value: string) => {
		onAdd(value);
		setInputValue('');
		inputRef.current?.focus();
	};

	return (
		<div className="list-editor">
			<input
				ref={inputRef}
				type="text"
				className="list-editor-input"
				value={inputValue}
				onChange={(e) => setInputValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={() => {
					// Small delay to allow click on suggestions
					setTimeout(() => onCancel(), 150);
				}}
				placeholder={isTagColumn ? 'Add tag...' : 'Add item...'}
			/>
			{suggestions.length > 0 && (
				<div className="list-editor-dropdown">
					{suggestions.map((val) => (
						<div
							key={val}
							className="list-editor-option"
							onMouseDown={(e) => {
								e.preventDefault(); // Prevent blur
								handleSuggestionClick(val);
							}}
						>
							{val}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
