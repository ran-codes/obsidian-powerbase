import React, { useRef, useEffect, useState } from 'react';

interface DateEditorProps {
	value: string | null;
	type: 'date' | 'datetime';
	onSave: (value: string | null) => void;
	onCancel: () => void;
}

/**
 * Inline date/datetime editor using HTML5 native inputs.
 * - Date: YYYY-MM-DD format
 * - Datetime: YYYY-MM-DDTHH:mm format (datetime-local)
 */
export function DateEditor({ value, type, onSave, onCancel }: DateEditorProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const cancelledRef = useRef(false);

	// Normalize value for the input
	const [inputValue, setInputValue] = useState(() => {
		if (!value) return '';
		if (type === 'datetime') {
			// Convert ISO datetime to datetime-local format (YYYY-MM-DDTHH:mm)
			// Handle both "2026-02-05T10:30:00.000Z" and "2026-02-05T10:30"
			const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
			if (match) return `${match[1]}T${match[2]}`;
			// If just a date, append midnight
			if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00`;
		}
		// Date: just YYYY-MM-DD
		const dateMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
		return dateMatch ? dateMatch[1] : value;
	});

	useEffect(() => {
		// Focus and select on mount
		if (inputRef.current) {
			inputRef.current.focus();
			// Open the picker immediately
			inputRef.current.showPicker?.();
		}
	}, []);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleSave();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelledRef.current = true;
			onCancel();
		}
	};

	const handleSave = () => {
		if (cancelledRef.current) return;
		if (!inputValue) {
			onSave(null);
			return;
		}
		// For datetime, store as ISO string
		if (type === 'datetime') {
			// datetime-local gives us YYYY-MM-DDTHH:mm, keep it simple
			onSave(inputValue);
		} else {
			// Date: YYYY-MM-DD
			onSave(inputValue);
		}
	};

	const handleBlur = () => {
		if (!cancelledRef.current) {
			handleSave();
		}
	};

	const handleClear = (e: React.MouseEvent) => {
		e.stopPropagation();
		onSave(null);
	};

	return (
		<div className="date-editor">
			<input
				ref={inputRef}
				type={type === 'datetime' ? 'datetime-local' : 'date'}
				className="date-editor-input"
				value={inputValue}
				onChange={(e) => setInputValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={handleBlur}
			/>
			{inputValue && (
				<button
					className="date-editor-clear"
					onClick={handleClear}
					title="Clear date"
					type="button"
				>
					×
				</button>
			)}
		</div>
	);
}
