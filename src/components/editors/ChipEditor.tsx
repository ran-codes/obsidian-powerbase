import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

interface ChipEditorProps {
	currentValues: string[];
	suggestions: string[];
	isTagColumn?: boolean;
	onAdd: (value: string) => void;
	onRemove: (index: number) => void;
	onClose: () => void;
}

/**
 * Unified chip editor matching vanilla Bases behavior:
 * - Shows chips inline with blinking cursor at end
 * - Dropdown appears below for suggestions
 * - Typing filters suggestions
 * - Enter/click adds selection
 */
export function ChipEditor({
	currentValues,
	suggestions,
	isTagColumn,
	onAdd,
	onRemove,
	onClose,
}: ChipEditorProps) {
	const [inputValue, setInputValue] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

	// Focus hidden input on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Update dropdown position
	useEffect(() => {
		if (containerRef.current) {
			const rect = containerRef.current.getBoundingClientRect();
			setDropdownPos({
				top: rect.bottom + 2,
				left: rect.left,
				width: Math.max(rect.width, 120),
			});
		}
	}, [currentValues]);

	// Filter suggestions: exclude current values, filter by input
	const filteredSuggestions = useMemo(() => {
		const currentSet = new Set(currentValues.map(v => v.toLowerCase()));
		return suggestions
			.filter(v => !currentSet.has(v.toLowerCase()))
			.filter(v => !inputValue || v.toLowerCase().includes(inputValue.toLowerCase()))
			.slice(0, 10); // Limit to 10 suggestions
	}, [suggestions, currentValues, inputValue]);

	// Reset selected index when suggestions change
	useEffect(() => {
		setSelectedIndex(0);
	}, [filteredSuggestions.length]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		switch (e.key) {
			case 'Enter':
				e.preventDefault();
				if (filteredSuggestions.length > 0) {
					onAdd(filteredSuggestions[selectedIndex]);
					setInputValue('');
				} else if (inputValue.trim()) {
					onAdd(inputValue.trim());
					setInputValue('');
				}
				break;
			case 'Escape':
				e.preventDefault();
				onClose();
				break;
			case 'ArrowDown':
				e.preventDefault();
				setSelectedIndex(i => Math.min(i + 1, filteredSuggestions.length - 1));
				break;
			case 'ArrowUp':
				e.preventDefault();
				setSelectedIndex(i => Math.max(i - 1, 0));
				break;
			case 'Backspace':
				if (!inputValue && currentValues.length > 0) {
					e.preventDefault();
					onRemove(currentValues.length - 1);
				}
				break;
		}
	};

	const handleSuggestionClick = (value: string) => {
		onAdd(value);
		setInputValue('');
		inputRef.current?.focus();
	};

	const chipClass = isTagColumn ? 'cell-chip cell-chip-tag' : 'cell-chip';

	return (
		<>
			<div
				ref={containerRef}
				className="chip-editor"
				onClick={() => inputRef.current?.focus()}
			>
				{currentValues.map((v, i) => (
					<span key={i} className={chipClass}>
						<span className="cell-chip-label">{v}</span>
						<span
							className="cell-chip-remove"
							onClick={(e) => {
								e.stopPropagation();
								onRemove(i);
							}}
							title="Remove"
						>
							×
						</span>
					</span>
				))}
				<span className="chip-editor-cursor">
					<input
						ref={inputRef}
						type="text"
						className="chip-editor-input"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						onBlur={() => {
							// Delay to allow click on suggestions
							setTimeout(() => onClose(), 150);
						}}
					/>
					{inputValue && <span className="chip-editor-text">{inputValue}</span>}
					<span className="chip-editor-caret">|</span>
				</span>
			</div>

			{/* Dropdown portal */}
			{filteredSuggestions.length > 0 && createPortal(
				<div
					className="chip-editor-dropdown"
					style={{
						position: 'fixed',
						top: dropdownPos.top,
						left: dropdownPos.left,
						minWidth: dropdownPos.width,
					}}
				>
					{filteredSuggestions.map((val, i) => (
						<div
							key={val}
							className={`chip-editor-option ${i === selectedIndex ? 'selected' : ''}`}
							onMouseDown={(e) => {
								e.preventDefault(); // Prevent blur
								handleSuggestionClick(val);
							}}
							onMouseEnter={() => setSelectedIndex(i)}
						>
							{val}
						</div>
					))}
				</div>,
				document.body
			)}
		</>
	);
}
