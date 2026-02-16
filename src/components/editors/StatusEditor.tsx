import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/** The three default status options */
const STATUS_OPTIONS = ['todo', 'backlog', 'done'] as const;

/** Status value color mapping */
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
	todo:    { bg: '#f5d89a', text: '#1a1a1a' },
	backlog: { bg: '#d5d5d5', text: '#1a1a1a' },
	done:    { bg: '#4caf50', text: '#ffffff' },
};

interface StatusEditorProps {
	currentValue: string | null;
	onSelect: (value: string) => void;
	onClose: () => void;
}

/**
 * Single-select status dropdown with 3 color-coded pill options.
 * Notion-style floating card with white background and shadow.
 */
export function StatusEditor({
	currentValue,
	onSelect,
	onClose,
}: StatusEditorProps) {
	const [focusedIndex, setFocusedIndex] = useState(() => {
		if (!currentValue) return 0;
		const idx = STATUS_OPTIONS.indexOf(currentValue.toLowerCase() as any);
		return idx >= 0 ? idx : 0;
	});
	const anchorRef = useRef<HTMLDivElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

	// Position the dropdown below the anchor
	useEffect(() => {
		if (anchorRef.current) {
			const rect = anchorRef.current.getBoundingClientRect();
			setDropdownPos({
				top: rect.bottom + 4,
				left: rect.left,
				width: Math.max(rect.width, 160),
			});
		}
	}, []);

	// Close on click outside the dropdown
	useEffect(() => {
		const handleMouseDown = (e: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node) &&
				anchorRef.current &&
				!anchorRef.current.contains(e.target as Node)
			) {
				onClose();
			}
		};
		document.addEventListener('mousedown', handleMouseDown);
		return () => document.removeEventListener('mousedown', handleMouseDown);
	}, [onClose]);

	// Keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault();
					setFocusedIndex(i => Math.min(i + 1, STATUS_OPTIONS.length - 1));
					break;
				case 'ArrowUp':
					e.preventDefault();
					setFocusedIndex(i => Math.max(i - 1, 0));
					break;
				case 'Enter':
					e.preventDefault();
					onSelect(STATUS_OPTIONS[focusedIndex]);
					break;
				case 'Escape':
					e.preventDefault();
					onClose();
					break;
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [focusedIndex, onSelect, onClose]);

	// Show current value chip in the cell + dropdown below
	const currentColors = currentValue
		? STATUS_COLORS[currentValue.toLowerCase()] ?? { bg: '#e0e0e0', text: '#1a1a1a' }
		: null;

	return (
		<>
			<div ref={anchorRef} className="status-editor-anchor">
				{currentValue && currentColors ? (
					<span
						className="cell-chip cell-chip-status"
						style={{ backgroundColor: currentColors.bg }}
					>
						<span className="cell-chip-label" style={{ color: currentColors.text }}>
							{currentValue}
						</span>
					</span>
				) : (
					<span className="cell-empty-placeholder">Select status...</span>
				)}
			</div>

			{createPortal(
				<div
					ref={dropdownRef}
					className="status-editor-dropdown"
					style={{
						position: 'fixed',
						top: dropdownPos.top,
						left: dropdownPos.left,
						minWidth: dropdownPos.width,
					}}
				>
					{STATUS_OPTIONS.map((option, i) => {
						const colors = STATUS_COLORS[option];
						const isSelected = currentValue?.toLowerCase() === option;
						return (
							<div
								key={option}
								className={`status-editor-option ${i === focusedIndex ? 'is-focused' : ''}`}
								onMouseDown={(e) => {
									e.preventDefault();
									onSelect(option);
								}}
								onMouseEnter={() => setFocusedIndex(i)}
							>
								<span
									className="status-editor-pill"
									style={{ backgroundColor: colors.bg, color: colors.text }}
								>
									{option}
								</span>
								{isSelected && (
									<svg className="status-editor-check" width="14" height="14" viewBox="0 0 16 16" fill="none">
										<path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
									</svg>
								)}
							</div>
						);
					})}
				</div>,
				document.body
			)}
		</>
	);
}
