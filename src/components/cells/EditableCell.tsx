import React, { useState, useCallback } from 'react';
import { Calendar, ExternalLink, Pencil } from 'lucide-react';
import type { CellContext } from '@tanstack/react-table';
import type { TableRowData } from '../../types';
import { TextEditor } from '../editors/TextEditor';
import { ChipEditor } from '../editors/ChipEditor';
import { DateEditor } from '../editors/DateEditor';
import { PriorityEditor } from '../editors/PriorityEditor';

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
	const [calendarOpen, setCalendarOpen] = useState(false);
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
	const isPriorityColumn = columnType === 'priority';
	const isMultitextColumn = columnType === 'list' || columnType === 'tags';
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
				openCalendar={calendarOpen}
			/>
		);
	}

	// Edit mode for text/number (but NOT multitext or priority columns)
	if (editing && typeof value !== 'boolean' && !Array.isArray(value) && !isMultitextColumn && !isPriorityColumn) {
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
		// Date columns: click opens editor, icon click opens calendar
		if (isDateColumn || isDatetimeColumn) {
			return (
				<span
					className="cell-date cell-date-empty"
					onClick={(e) => {
						const onIcon = (e.target as HTMLElement).closest('.cell-date-icon') !== null;
						setCalendarOpen(onIcon);
						setEditing(true);
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter') { setCalendarOpen(false); setEditing(true); }
					}}
					tabIndex={0}
				>
					<Calendar size={14} className="cell-date-icon" />
					<span className="cell-date-placeholder">mm/dd/yyyy</span>
				</span>
			);
		}

		// Priority column: single-select dropdown with 3 options
		if (isPriorityColumn) {
			if (editing) {
				return (
					<PriorityEditor
						currentValue={null}
						onSelect={(selected) => {
							setEditing(false);
							table.options.meta?.updateCell?.(row.index, column.id, selected);
						}}
						onClose={() => setEditing(false)}
					/>
				);
			}

			return (
				<div className="cell-chip-list" onClick={() => setEditing(true)}>
					<span className="cell-empty-placeholder">Click to set...</span>
				</div>
			);
		}

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
				className="cell-empty"
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

	// Priority column — single-select with color-coded chip display
	if (isPriorityColumn) {
		// Normalize: extract the single priority value from string or array
		const priorityValue: string | null = Array.isArray(value)
			? (value.find((v: any) => typeof v === 'string' && v) ?? null)
			: (typeof value === 'string' ? value : null);

		if (editing) {
			return (
				<PriorityEditor
					currentValue={priorityValue}
					onSelect={(selected) => {
						setEditing(false);
						table.options.meta?.updateCell?.(row.index, column.id, selected);
					}}
					onClose={() => setEditing(false)}
				/>
			);
		}

		// Display mode: show color-coded chip
		if (priorityValue) {
			if (isPriorityEnhanced) {
				const colors = PRIORITY_COLORS[priorityValue.toLowerCase()] ?? PRIORITY_DEFAULT;
				return (
					<div className="cell-chip-list" onClick={() => setEditing(true)}>
						<span
							className="cell-chip cell-chip-priority"
							style={{ backgroundColor: colors.bg }}
						>
							<span className="cell-chip-label" style={{ color: colors.text }}>{priorityValue}</span>
							<span
								className="cell-chip-remove"
								onClick={(e) => {
									e.stopPropagation();
									table.options.meta?.updateCell?.(row.index, column.id, null);
								}}
								title="Remove"
							>
								×
							</span>
						</span>
					</div>
				);
			}
			return (
				<div className="cell-chip-list" onClick={() => setEditing(true)}>
					<span className="cell-chip">
						<span className="cell-chip-label">{priorityValue}</span>
						<span
							className="cell-chip-remove"
							onClick={(e) => {
								e.stopPropagation();
								table.options.meta?.updateCell?.(row.index, column.id, null);
							}}
							title="Remove"
						>
							×
						</span>
					</span>
				</div>
			);
		}

		return (
			<div className="cell-chip-list" onClick={() => setEditing(true)}>
				<span className="cell-empty-placeholder">Click to set...</span>
			</div>
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
				className="cell-date"
				onClick={(e) => {
					const onIcon = (e.target as HTMLElement).closest('.cell-date-icon') !== null;
					setCalendarOpen(onIcon);
					setEditing(true);
				}}
				onKeyDown={(e) => {
					if (e.key === 'Enter') { setCalendarOpen(false); setEditing(true); }
				}}
				tabIndex={0}
				title={value}
			>
				<Calendar size={14} className="cell-date-icon" />
				{formatted}
			</span>
		);
	}

	// URL text — clickable link + pencil icon on hover to edit
	const strValue = String(value);
	if (typeof value === 'string' && /^https?:\/\/.+/.test(strValue)) {
		return (
			<span
				className="cell-text cell-url"
				tabIndex={0}
				onKeyDown={(e) => {
					if (e.key === 'Enter') setEditing(true);
				}}
			>
				<a
					href={strValue}
					className="cell-url-link"
					title={strValue}
					draggable={false}
					onClick={(e) => {
						e.preventDefault();
						window.open(strValue, '_blank');
					}}
				>
					{strValue}
				</a>
				<ExternalLink size={14} className="cell-url-icon cell-url-icon-link" onClick={(e) => { e.stopPropagation(); window.open(strValue, '_blank'); }} />
				<Pencil size={14} className="cell-url-icon cell-url-icon-edit" onClick={(e) => { e.stopPropagation(); setEditing(true); }} />
			</span>
		);
	}

	// Text/number — double-click to edit
	return (
		<span
			className="cell-text"
			onDoubleClick={() => setEditing(true)}
			onKeyDown={(e) => {
				if (e.key === 'Enter') setEditing(true);
			}}
			tabIndex={0}
		>
			{strValue}
		</span>
	);
}

/**
 * Format a date/datetime string for display.
 * Outputs MM/DD/YYYY to match vanilla Bases.
 */
function formatDateValue(value: string, isDatetime: boolean): string {
	try {
		if (isDatetime) {
			const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
			if (match) {
				const [, y, m, d, hh, mm] = match;
				return `${m}/${d}/${y} ${hh}:${mm}`;
			}
			const date = new Date(value);
			if (isNaN(date.getTime())) return value;
			const mm = String(date.getMonth() + 1).padStart(2, '0');
			const dd = String(date.getDate()).padStart(2, '0');
			return `${mm}/${dd}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
		} else {
			const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
			if (parts) {
				return `${parts[2]}/${parts[3]}/${parts[1]}`;
			}
			const date = new Date(value);
			if (isNaN(date.getTime())) return value;
			const mm = String(date.getMonth() + 1).padStart(2, '0');
			const dd = String(date.getDate()).padStart(2, '0');
			return `${mm}/${dd}/${date.getFullYear()}`;
		}
	} catch {
		return value;
	}
}
