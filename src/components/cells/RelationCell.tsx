import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CellContext } from '@tanstack/react-table';
import type { TFile } from 'obsidian';
import type { TableRowData, WikiLink } from '../../types';
import { ParseService } from '../../services/ParseService';
import { NoteSearchService } from '../../services/NoteSearchService';
import { useApp } from '../AppContext';
import { useMru } from '../MruContext';
import { FileContextMenu } from '../FileContextMenu';

interface ContextMenuState {
	x: number;
	y: number;
	file: TFile;
}

/**
 * Relation cell renderer with inline ChipEditor pattern.
 * Display mode: renders wikilinks as clickable chips.
 * Edit mode: inline cursor with dropdown suggestions.
 */
export function RelationCell({
	getValue,
	row,
	column,
	table,
}: CellContext<TableRowData, unknown>) {
	const [editing, setEditing] = useState(false);
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
	const app = useApp();

	const rawValue = getValue();
	const links: WikiLink[] = ParseService.parseWikiLinks(rawValue);
	const file = row.original.file;
	const folderFilter = table.options.meta?.getRelationFolder(column.id);

	const handleChipClick = useCallback(
		(e: React.MouseEvent, link: WikiLink) => {
			e.stopPropagation();
			app.workspace.openLinkText(link.path, file.path);
		},
		[app, file]
	);

	const handleChipContextMenu = useCallback(
		(e: React.MouseEvent, link: WikiLink) => {
			e.preventDefault();
			e.stopPropagation();
			const resolvedFile = app.metadataCache.getFirstLinkpathDest(link.path, file.path);
			if (resolvedFile) {
				setContextMenu({
					x: e.clientX,
					y: e.clientY,
					file: resolvedFile,
				});
			}
		},
		[app, file]
	);

	const handleRemove = useCallback(
		(index: number) => {
			const remaining = links
				.filter((_, i) => i !== index)
				.map((l) => l.raw);
			table.options.meta?.updateRelation(row.index, column.id, remaining);
		},
		[links, table, row.index, column.id]
	);

	const handleAdd = useCallback(
		(notePath: string) => {
			const wikilink = ParseService.formatAsWikiLink(notePath);
			const newLinks = [...links.map(l => l.raw), wikilink];
			table.options.meta?.updateRelation(row.index, column.id, newLinks);
		},
		[links, table, row.index, column.id]
	);

	// Edit mode - inline ChipEditor
	if (editing) {
		return (
			<>
				<RelationChipEditor
					links={links}
					folderFilter={folderFilter}
					onAdd={handleAdd}
					onRemove={handleRemove}
					onClose={() => setEditing(false)}
					onChipClick={handleChipClick}
					onChipContextMenu={handleChipContextMenu}
				/>
				{contextMenu && (
					<FileContextMenu
						x={contextMenu.x}
						y={contextMenu.y}
						file={contextMenu.file}
						app={app}
						onClose={() => setContextMenu(null)}
					/>
				)}
			</>
		);
	}

	// Display mode - show chips
	return (
		<>
			<div
				className="relation-cell"
				onClick={() => setEditing(true)}
			>
				{links.map((link, i) => (
					<span
						key={i}
						className="relation-chip"
						title={link.path}
						onContextMenu={(e) => handleChipContextMenu(e, link)}
					>
						<span
							className="relation-chip-label"
							onClick={(e) => handleChipClick(e, link)}
						>
							{link.display}
						</span>
						<span
							className="relation-chip-remove"
							onClick={(e) => {
								e.stopPropagation();
								handleRemove(i);
							}}
							title="Remove"
						>
							×
						</span>
					</span>
				))}
				{links.length === 0 && (
					<span className="cell-empty-placeholder">Click to add...</span>
				)}
			</div>
			{contextMenu && (
				<FileContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					file={contextMenu.file}
					app={app}
					onClose={() => setContextMenu(null)}
				/>
			)}
		</>
	);
}

/**
 * Inline chip editor for relations with note suggestions.
 */
function RelationChipEditor({
	links,
	folderFilter,
	onAdd,
	onRemove,
	onClose,
	onChipClick,
	onChipContextMenu,
}: {
	links: WikiLink[];
	folderFilter?: string;
	onAdd: (notePath: string) => void;
	onRemove: (index: number) => void;
	onClose: () => void;
	onChipClick: (e: React.MouseEvent, link: WikiLink) => void;
	onChipContextMenu: (e: React.MouseEvent, link: WikiLink) => void;
}) {
	const app = useApp();
	const mru = useMru();
	const [inputValue, setInputValue] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

	// Get all notes as suggestions, MRU-sorted
	const { allNotes, mruCount } = useMemo(() => {
		const raw = NoteSearchService.getAllNotes(app, folderFilter);
		const scope = folderFilter ?? '__global__';
		const result = NoteSearchService.sortWithMru(raw, mru.getRecent(scope));
		return { allNotes: result.files, mruCount: result.mruCount };
	}, [app, folderFilter, mru]);

	// Focus on mount
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
				width: Math.max(rect.width, 150),
			});
		}
	}, [links]);

	// Filter suggestions, tracking MRU divider position
	const { suggestions, mruDividerAfter } = useMemo(() => {
		const currentPaths = new Set(links.map(l => l.path.toLowerCase()));
		const filtered = allNotes
			.filter(f => !currentPaths.has(f.path.replace(/\.md$/, '').toLowerCase()))
			.filter(f => !inputValue || f.basename.toLowerCase().includes(inputValue.toLowerCase()));
		// Count how many MRU items survive filtering
		let mruVisible = 0;
		for (let i = 0; i < Math.min(mruCount, filtered.length); i++) {
			// MRU items are in the first mruCount positions of allNotes;
			// after filtering, they keep their relative order but count may differ
			const idx = allNotes.indexOf(filtered[i]);
			if (idx < mruCount) mruVisible++;
			else break;
		}
		return {
			suggestions: filtered.slice(0, 10),
			mruDividerAfter: mruVisible > 0 && mruVisible < filtered.slice(0, 10).length ? mruVisible : -1,
		};
	}, [allNotes, links, inputValue, mruCount]);

	useEffect(() => {
		setSelectedIndex(0);
	}, [suggestions.length]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		switch (e.key) {
			case 'Enter':
				e.preventDefault();
				if (suggestions.length > 0) {
					const selected = suggestions[selectedIndex];
					const notePath = selected.path.replace(/\.md$/, '');
					onAdd(notePath);
					mru.recordSelection(folderFilter ?? '__global__', notePath);
					setInputValue('');
				}
				break;
			case 'Escape':
				e.preventDefault();
				onClose();
				break;
			case 'ArrowDown':
				e.preventDefault();
				setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
				break;
			case 'ArrowUp':
				e.preventDefault();
				setSelectedIndex(i => Math.max(i - 1, 0));
				break;
			case 'Backspace':
				if (!inputValue && links.length > 0) {
					e.preventDefault();
					onRemove(links.length - 1);
				}
				break;
		}
	};

	const handleSuggestionClick = (file: TFile) => {
		const notePath = file.path.replace(/\.md$/, '');
		onAdd(notePath);
		mru.recordSelection(folderFilter ?? '__global__', notePath);
		setInputValue('');
		inputRef.current?.focus();
	};

	return (
		<>
			<div
				ref={containerRef}
				className="chip-editor"
				onClick={() => inputRef.current?.focus()}
			>
				{links.map((link, i) => (
					<span
						key={i}
						className="relation-chip"
						title={link.path}
						onContextMenu={(e) => onChipContextMenu(e, link)}
					>
						<span
							className="relation-chip-label"
							onClick={(e) => onChipClick(e, link)}
						>
							{link.display}
						</span>
						<span
							className="relation-chip-remove"
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
						onBlur={() => setTimeout(() => onClose(), 150)}
					/>
					{inputValue && <span className="chip-editor-text">{inputValue}</span>}
					<span className="chip-editor-caret">|</span>
				</span>
			</div>

			{suggestions.length > 0 && createPortal(
				<div
					className="chip-editor-dropdown"
					style={{
						position: 'fixed',
						top: dropdownPos.top,
						left: dropdownPos.left,
						minWidth: dropdownPos.width,
					}}
				>
					{suggestions.map((file, i) => (
						<React.Fragment key={file.path}>
							{i === mruDividerAfter && (
								<div className="chip-editor-divider" />
							)}
							<div
								className={`chip-editor-option ${i === selectedIndex ? 'selected' : ''}`}
								onMouseDown={(e) => {
									e.preventDefault();
									handleSuggestionClick(file);
								}}
								onMouseEnter={() => setSelectedIndex(i)}
							>
								{file.basename}
							</div>
						</React.Fragment>
					))}
				</div>,
				document.body
			)}
		</>
	);
}
