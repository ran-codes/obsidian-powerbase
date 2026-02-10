import React, { useState, useCallback } from 'react';
import type { CellContext } from '@tanstack/react-table';
import type { TableRowData } from '../../types';
import { TextEditor } from '../editors/TextEditor';
import { ChipEditor } from '../editors/ChipEditor';
import { DateEditor } from '../editors/DateEditor';

/** Priority value → chip color mapping */
const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
	high:   { bg: '#e74c3c', text: '#ffffff' },
	medium: { bg: '#f5d89a', text: '#1a1a1a' },
	low:    { bg: '#a3d5f5', text: '#1a1a1a' },
};
const PRIORITY_DEFAULT = { bg: '#e0e0e0', text: '#1a1a1a' };

/** Strip wikilink brackets and show display name or basename */
function stripWikilink(v: string): string {
	const m = v.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
	if (!m) return v;
	const path = m[1];
	const alias = m[2];
	if (alias) return alias;
	const lastSlash = path.lastIndexOf('/');
	return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
}

/**
 * Editable cell renderer for non-relation, non-rollup columns.
 * Display mode: shows read-only value (text, number, checkbox, array).
 * Edit mode: mounts inline editor (double-click or Enter to activate).
 *
 * Booleans toggle immediately on click (no editor needed).
 * Arrays/multitext use ChipEditor with inline cursor.
 */
export function EditableCell({
	getValue,
	row,
	column,
	table,
}: CellContext<TableRowData, unknown>) {
	const [editing, setEditing] = useState(false);
	const value = getValue();

	const handleSave = useCallback(
		(newValue: any) => {
			setEditing(false);
			table.options.meta?.updateCell?.(row.index, column.id, newValue);
		},
		[table, row.index, column.id]
	);

	const handleCancel = useCallback(() => {
		setEditing(false);
	}, []);

	// Determine if this cell is keyboard-focused
	const focusedCell = table.options.meta?.focusedCell;
	const colIndex = table
		.getAllColumns()
		.findIndex((c) => c.id === column.id);
	const isFocused =
		focusedCell?.rowIndex === row.index &&
		focusedCell?.colIndex === colIndex;

	// Get column type early (needed for multitext detection)
	const columnType = table.options.meta?.getColumnType?.(column.id);
	const isMultitextColumn = columnType === 'list' || columnType === 'tags' || columnType === 'priority';
	const isTagColumn = columnType === 'tags' || column.id === 'note.tags' || column.id.endsWith('.tags');
	const isDateColumn = columnType === 'date';
	const isDatetimeColumn = columnType === 'datetime';
	const isPriorityEnhanced = table.options.meta?.isColumnPriorityEnhanced?.(column.id) ?? false;

	// Edit mode for date/datetime
	if (editing && (isDateColumn || isDatetimeColumn)) {
		return (
			<DateEditor
				value={typeof value === 'string' ? value : null}
				type={isDatetimeColumn ? 'datetime' : 'date'}
				onSave={handleSave}
				onCancel={handleCancel}
			/>
		);
	}

	// Edit mode for text/number (but NOT multitext columns - those use ChipEditor)
	if (editing && typeof value !== 'boolean' && !Array.isArray(value) && !isMultitextColumn) {
		const editorType = typeof value === 'number' ? 'number' : 'text';
		return (
			<TextEditor
				value={value}
				type={editorType as 'text' | 'number'}
				onSave={handleSave}
				onCancel={handleCancel}
			/>
		);
	}

	// Null/undefined/empty
	if (value === null || value === undefined || value === 'null') {
		// If this is a list or tags column, show empty chip editor on click
		if (isMultitextColumn) {
			const allValues = table.options.meta?.getColumnValues?.(column.id) || [];

			if (editing) {
				return (
					<ChipEditor
						currentValues={[]}
						suggestions={allValues}
						isTagColumn={isTagColumn}
						onAdd={(newValue) => {
							table.options.meta?.updateCell?.(row.index, column.id, [newValue]);
						}}
						onRemove={() => {}}
						onClose={() => setEditing(false)}
					/>
				);
			}

			return (
				<div className="cell-chip-list" onClick={() => setEditing(true)}>
					<span className="cell-empty-placeholder">Click to add...</span>
				</div>
			);
		}

		// Default: empty cell that can be edited
		return (
			<span
				className={`cell-empty ${isFocused ? 'cell-focused' : ''}`}
				onDoubleClick={() => setEditing(true)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') setEditing(true);
				}}
				tabIndex={0}
			/>
		);
	}

	// Boolean — toggle immediately on click
	if (typeof value === 'boolean') {
		return (
			<input
				type="checkbox"
				checked={value}
				className="cell-checkbox cell-checkbox-editable"
				onChange={(e) => {
					table.options.meta?.updateCell?.(
						row.index,
						column.id,
						e.target.checked
					);
				}}
			/>
		);
	}

	// Array or multitext scalar — use ChipEditor
	const isArrayData = Array.isArray(value);
	const isScalarMultitext = isMultitextColumn && typeof value === 'string';

	if (isArrayData || isScalarMultitext) {
		// Normalize: scalar string → single-item array
		const currentValues: string[] = isArrayData
			? (value as any[]).filter(v => typeof v === 'string')
			: [value as string];
		const allValues = table.options.meta?.getColumnValues?.(column.id) || [];

		const handleRemove = (index: number) => {
			const newValue = currentValues.filter((_, i) => i !== index);
			table.options.meta?.updateCell?.(row.index, column.id, newValue);
		};

		const handleAdd = (newValue: string) => {
			const updated = [...currentValues, newValue];
			table.options.meta?.updateCell?.(row.index, column.id, updated);
		};

		// Editing mode - show ChipEditor with inline cursor
		if (editing) {
			return (
				<ChipEditor
					currentValues={currentValues}
					suggestions={allValues}
					isTagColumn={isTagColumn}
					onAdd={handleAdd}
					onRemove={handleRemove}
					onClose={() => setEditing(false)}
				/>
			);
		}

		// Display mode - show chips only
		const chipClass = isTagColumn ? 'cell-chip cell-chip-tag' : 'cell-chip';
		return (
			<div
				className="cell-chip-list"
				onClick={() => setEditing(true)}
			>
				{currentValues.map((v, i) => {
					if (isPriorityEnhanced) {
						const colors = PRIORITY_COLORS[v.toLowerCase()] ?? PRIORITY_DEFAULT;
						return (
							<span
								key={i}
								className="cell-chip cell-chip-priority"
								style={{ backgroundColor: colors.bg }}
							>
								<span className="cell-chip-label" style={{ color: colors.text }}>{v}</span>
								<span
									className="cell-chip-remove"
									onClick={(e) => {
										e.stopPropagation();
										handleRemove(i);
									}}
									title="Remove"
								>
									×
								</span>
							</span>
						);
					}
					return (
						<span key={i} className={chipClass}>
							<span className="cell-chip-label">{stripWikilink(v)}</span>
							<span
								className="cell-chip-remove"
								onClick={(e) => {
									e.stopPropagation();
									handleRemove(i);
								}}
								title="Remove"
							>
								×
							</span>
						</span>
					);
				})}
				{currentValues.length === 0 && (
					<span className="cell-empty-placeholder">Click to add...</span>
				)}
			</div>
		);
	}

	// Date/datetime — format nicely
	if ((isDateColumn || isDatetimeColumn) && typeof value === 'string') {
		const formatted = formatDateValue(value, isDatetimeColumn);
		return (
			<span
				className={`cell-date ${isFocused ? 'cell-focused' : ''}`}
				onDoubleClick={() => setEditing(true)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') setEditing(true);
				}}
				tabIndex={0}
				title={value} // Show raw value on hover
			>
				{formatted}
			</span>
		);
	}

	// Text/number — double-click to edit
	return (
		<span
			className={`cell-text ${isFocused ? 'cell-focused' : ''}`}
			onDoubleClick={() => setEditing(true)}
			onKeyDown={(e) => {
				if (e.key === 'Enter') setEditing(true);
			}}
			tabIndex={0}
		>
			{String(value)}
		</span>
	);
}

/**
 * Format a date/datetime string for display.
 * Shows locale-appropriate format for better readability.
 */
function formatDateValue(value: string, isDatetime: boolean): string {
	try {
		// Parse the date string
		const date = new Date(value);
		if (isNaN(date.getTime())) return value;

		if (isDatetime) {
			// Show date and time
			return date.toLocaleString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
			});
		} else {
			// Just date - parse as local date to avoid timezone shift
			// Input is YYYY-MM-DD, we want to display it without timezone conversion
			const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
			if (parts) {
				const localDate = new Date(
					parseInt(parts[1]),
					parseInt(parts[2]) - 1,
					parseInt(parts[3])
				);
				return localDate.toLocaleDateString(undefined, {
					year: 'numeric',
					month: 'short',
					day: 'numeric',
				});
			}
			return date.toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
			});
		}
	} catch {
		return value;
	}
}
