import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ColumnType } from '../types';

interface ColumnContextMenuProps {
	x: number;
	y: number;
	columnId: string;
	columnName: string;
	columnType?: ColumnType;
	isPriority?: boolean;
	priorityEnhanced?: boolean;
	isRelation?: boolean;
	relationEnhanced?: boolean;
	currentSort?: 'ASC' | 'DESC' | null;
	onClose: () => void;
	onHideColumn: () => void;
	onSortAsc: () => void;
	onSortDesc: () => void;
	onClearSort: () => void;
	onTogglePriorityEnhanced?: (enabled: boolean) => void;
	onToggleRelationEnhanced?: (enabled: boolean) => void;
}

/** Get human-readable type name */
function getTypeName(type?: ColumnType): string {
	switch (type) {
		case 'file': return 'File';
		case 'relation': return 'Relation';
		case 'tags': return 'Tags';
		case 'list': return 'List';
		case 'checkbox': return 'Checkbox';
		case 'number': return 'Number';
		case 'text': return 'Text';
		case 'rollup': return 'Rollup';
		case 'actions': return 'Actions';
		case 'priority': return 'Priority';
		default: return 'Text';
	}
}

export function ColumnContextMenu({
	x,
	y,
	columnId,
	columnName,
	columnType,
	isPriority,
	priorityEnhanced,
	isRelation,
	relationEnhanced,
	currentSort,
	onClose,
	onHideColumn,
	onSortAsc,
	onSortDesc,
	onClearSort,
	onTogglePriorityEnhanced,
	onToggleRelationEnhanced,
}: ColumnContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	// Close on click outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};

		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleEscape);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleEscape);
		};
	}, [onClose]);

	// Adjust position to stay within viewport
	useEffect(() => {
		if (menuRef.current) {
			const rect = menuRef.current.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;

			let newX = x;
			let newY = y;

			if (x + rect.width > viewportWidth) {
				newX = Math.max(0, x - rect.width);
			}
			if (y + rect.height > viewportHeight) {
				newY = Math.max(0, y - rect.height);
			}

			menuRef.current.style.left = `${newX}px`;
			menuRef.current.style.top = `${newY}px`;
		}
	}, [x, y]);

	// Use portal to render to document.body for correct fixed positioning
	return createPortal(
		<div
			ref={menuRef}
			className="column-context-menu"
			style={{ left: x, top: y }}
		>
			<div
				className="column-menu-item"
				onClick={() => {
					onHideColumn();
					onClose();
				}}
			>
				<span className="column-menu-icon">👁</span>
				<span className="column-menu-label">Hide column</span>
			</div>

			<div className="column-menu-separator" />

			<div
				className={`column-menu-item ${currentSort === 'ASC' ? 'checked' : ''}`}
				onClick={() => {
					onSortAsc();
					onClose();
				}}
			>
				<span className="column-menu-icon">↑</span>
				<span className="column-menu-label">Sort A → Z</span>
				{currentSort === 'ASC' && <span className="column-menu-check">✓</span>}
			</div>

			<div
				className={`column-menu-item ${currentSort === 'DESC' ? 'checked' : ''}`}
				onClick={() => {
					onSortDesc();
					onClose();
				}}
			>
				<span className="column-menu-icon">↓</span>
				<span className="column-menu-label">Sort Z → A</span>
				{currentSort === 'DESC' && <span className="column-menu-check">✓</span>}
			</div>

			{currentSort && (
				<div
					className="column-menu-item danger"
					onClick={() => {
						onClearSort();
						onClose();
					}}
				>
					<span className="column-menu-icon">✕</span>
					<span className="column-menu-label">Clear sort</span>
				</div>
			)}

			<div className="column-menu-separator" />

			<div className="column-menu-item column-menu-info">
				<span className="column-menu-icon">ⓘ</span>
				<span className="column-menu-label">Property type</span>
				<span className="column-menu-value">{getTypeName(columnType)}</span>
			</div>

			{isRelation && (
				<>
					<div className="column-menu-item column-menu-info">
						<span className="column-menu-icon">⚑</span>
						<span className="column-menu-label">Inferred Relation Column</span>
					</div>
					<div
						className={`column-menu-item ${relationEnhanced ? 'checked' : ''}`}
						onClick={() => onToggleRelationEnhanced?.(!relationEnhanced)}
						title="Wikilink chips with note links, folder-filtered picker, and bidirectional sync"
					>
						<span className="column-menu-icon">
							{relationEnhanced ? '☑' : '☐'}
						</span>
						<span className="column-menu-label">Enhanced UI</span>
						{relationEnhanced && <span className="column-menu-check">✓</span>}
					</div>
				</>
			)}

			{isPriority && (
				<>
					<div className="column-menu-item column-menu-info">
						<span className="column-menu-icon">⚑</span>
						<span className="column-menu-label">Inferred Priority Column</span>
					</div>
					<div
						className={`column-menu-item ${priorityEnhanced ? 'checked' : ''}`}
						onClick={() => onTogglePriorityEnhanced?.(!priorityEnhanced)}
						title="Color-coded chips: red for high, yellow for medium, blue for low"
					>
						<span className="column-menu-icon">
							{priorityEnhanced ? '☑' : '☐'}
						</span>
						<span className="column-menu-label">Enhanced UI</span>
						{priorityEnhanced && <span className="column-menu-check">✓</span>}
					</div>
				</>
			)}
		</div>,
		document.body
	);
}
