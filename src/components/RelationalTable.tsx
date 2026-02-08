import React, { useMemo, useState, useCallback, ReactNode } from 'react';
import {
	FileText,
	ArrowUpRight,
	Tag,
	List,
	CheckSquare,
	Hash,
	Sigma,
	Zap,
	Type,
} from 'lucide-react';
import {
	useReactTable,
	getCoreRowModel,
	flexRender,
	createColumnHelper,
	ColumnDef,
	RowData,
} from '@tanstack/react-table';
import type { TFile } from 'obsidian';
import type { TableRowData, ColumnMeta, SortConfig, FocusedCell, QuickActionConfig, ColumnType } from '../types';
import { EditableCell } from './cells/EditableCell';
import { FileNameCell } from './cells/FileNameCell';
import { RelationCell } from './cells/RelationCell';
import { RollupCell } from './cells/RollupCell';
import { QuickActionsCell } from './cells/QuickActionsCell';
import { ColumnContextMenu } from './ColumnContextMenu';

// Extend TableMeta for all table interactions
declare module '@tanstack/react-table' {
	interface TableMeta<TData extends RowData> {
		updateRelation: (
			rowIndex: number,
			columnId: string,
			newLinks: string[]
		) => void;
		updateCell?: (
			rowIndex: number,
			columnId: string,
			value: any
		) => void;
		focusedCell: FocusedCell | null;
		setFocusedCell: (cell: FocusedCell | null) => void;
		baseFolder?: string;
		getRelationFolder: (columnId: string) => string | undefined;
		getColumnType: (columnId: string) => ColumnType | undefined;
		getColumnValues: (columnId: string) => string[];
		quickActions?: QuickActionConfig[];
		executeQuickAction?: (rowIndex: number, action: QuickActionConfig) => Promise<void>;
	}
}

interface RelationalTableProps {
	rows: TableRowData[];
	columns: ColumnMeta[];
	sortConfig: SortConfig[];
	summaryValues?: Record<string, any>;
	baseFolder?: string;
	onUpdateRelation: (
		file: TFile,
		propertyId: string,
		newLinks: string[]
	) => void;
	onUpdateCell?: (
		file: TFile,
		propertyId: string,
		value: any
	) => void;
	quickActions?: QuickActionConfig[];
	onExecuteQuickAction?: (file: TFile, action: QuickActionConfig) => Promise<void>;
	onHideColumn?: (columnId: string) => void;
	onSortColumn?: (columnId: string, direction: 'ASC' | 'DESC' | null) => void;
}

interface ContextMenuState {
	isOpen: boolean;
	x: number;
	y: number;
	columnId: string;
	columnName: string;
	columnType?: ColumnType;
}

const columnHelper = createColumnHelper<TableRowData>();

const ICON_SIZE = 16;

/** Get the Lucide icon for a column type */
function getColumnTypeIcon(type?: ColumnType): ReactNode {
	const props = { size: ICON_SIZE, strokeWidth: 2 };
	switch (type) {
		case 'file': return <FileText {...props} />;
		case 'relation': return <ArrowUpRight {...props} />;
		case 'tags': return <Tag {...props} />;
		case 'list': return <List {...props} />;
		case 'checkbox': return <CheckSquare {...props} />;
		case 'number': return <Hash {...props} />;
		case 'rollup': return <Sigma {...props} />;
		case 'actions': return <Zap {...props} />;
		case 'text': return <Type {...props} />;
		default: return null;
	}
}

export function RelationalTable({
	rows,
	columns,
	sortConfig,
	summaryValues,
	baseFolder,
	onUpdateRelation,
	onUpdateCell,
	quickActions,
	onExecuteQuickAction,
	onHideColumn,
	onSortColumn,
}: RelationalTableProps) {
	const [focusedCell, setFocusedCell] = useState<FocusedCell | null>(null);
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

	// Build column definitions from ColumnMeta[]
	const columnDefs: ColumnDef<TableRowData, any>[] = useMemo(
		() =>
			columns.map((col) =>
				columnHelper.accessor(
					(row) => row[col.propertyId],
					{
						id: col.propertyId,
						header: () => {
							const sort = sortConfig.find(
								(s) => s.propertyId === col.propertyId
							);
							const typeIcon = getColumnTypeIcon(col.columnType);
							return (
								<span className="column-header">
									{typeIcon !== null && (
										<span className="column-type-icon">
											{typeIcon}
										</span>
									)}
									<span className="column-name">
										{col.displayName}
									</span>
									{sort && (
										<span className="sort-indicator">
											{sort.direction === 'ASC'
												? ' \u2191'
												: ' \u2193'}
										</span>
									)}
								</span>
							);
						},
						cell: col.isQuickActions
							? QuickActionsCell
							: col.isRollup
								? RollupCell
								: col.isRelation
									? RelationCell
									: col.propertyId === 'file.name'
										? FileNameCell
										: EditableCell,
						size: 150,
						minSize: 50,
					}
				)
			),
		[columns, sortConfig]
	);

	const table = useReactTable({
		data: rows,
		columns: columnDefs,
		getCoreRowModel: getCoreRowModel(),
		manualSorting: true,
		columnResizeMode: 'onChange',
		meta: {
			updateRelation: (
				rowIndex: number,
				columnId: string,
				newLinks: string[]
			) => {
				const file = rows[rowIndex]?.file;
				if (file) {
					onUpdateRelation(file, columnId, newLinks);
				}
			},
			updateCell: onUpdateCell
				? (rowIndex: number, columnId: string, value: any) => {
						const file = rows[rowIndex]?.file;
						if (file) {
							onUpdateCell(file, columnId, value);
						}
				  }
				: undefined,
			focusedCell,
			setFocusedCell,
			baseFolder,
			getRelationFolder: (columnId: string) => {
				const col = columns.find((c) => c.propertyId === columnId);
				return col?.relationFolderFilter ?? baseFolder;
			},
			getColumnType: (columnId: string) => {
				const col = columns.find((c) => c.propertyId === columnId);
				return col?.columnType;
			},
			getColumnValues: (columnId: string) => {
				// Collect all unique values from this column across all rows
				const values: string[] = [];
				for (const row of rows) {
					const val = row[columnId];
					if (Array.isArray(val)) {
						for (const item of val) {
							if (typeof item === 'string' && item) {
								values.push(item);
							}
						}
					} else if (typeof val === 'string' && val) {
						values.push(val);
					}
				}
				return [...new Set(values)];
			},
			quickActions,
			executeQuickAction: onExecuteQuickAction
				? async (rowIndex: number, action: QuickActionConfig) => {
						const file = rows[rowIndex]?.file;
						if (file) {
							await onExecuteQuickAction(file, action);
						}
				  }
				: undefined,
		},
	});

	// Column header right-click handler
	const handleColumnContextMenu = useCallback(
		(e: React.MouseEvent, columnId: string, columnName: string, columnType?: ColumnType) => {
			e.preventDefault();
			setContextMenu({
				isOpen: true,
				x: e.clientX,
				y: e.clientY,
				columnId,
				columnName,
				columnType,
			});
		},
		[]
	);

	const closeContextMenu = useCallback(() => {
		setContextMenu(null);
	}, []);

	// Keyboard navigation handler
	const handleTableKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (!focusedCell) return;
			const { rowIndex, colIndex } = focusedCell;
			const maxRow = rows.length - 1;
			const maxCol = columns.length - 1;

			switch (e.key) {
				case 'ArrowUp':
					e.preventDefault();
					if (rowIndex > 0)
						setFocusedCell({
							rowIndex: rowIndex - 1,
							colIndex,
						});
					break;
				case 'ArrowDown':
					e.preventDefault();
					if (rowIndex < maxRow)
						setFocusedCell({
							rowIndex: rowIndex + 1,
							colIndex,
						});
					break;
				case 'ArrowLeft':
					e.preventDefault();
					if (colIndex > 0)
						setFocusedCell({
							rowIndex,
							colIndex: colIndex - 1,
						});
					break;
				case 'ArrowRight':
					e.preventDefault();
					if (colIndex < maxCol)
						setFocusedCell({
							rowIndex,
							colIndex: colIndex + 1,
						});
					break;
				case 'Tab':
					e.preventDefault();
					if (e.shiftKey) {
						if (colIndex > 0)
							setFocusedCell({
								rowIndex,
								colIndex: colIndex - 1,
							});
						else if (rowIndex > 0)
							setFocusedCell({
								rowIndex: rowIndex - 1,
								colIndex: maxCol,
							});
					} else {
						if (colIndex < maxCol)
							setFocusedCell({
								rowIndex,
								colIndex: colIndex + 1,
							});
						else if (rowIndex < maxRow)
							setFocusedCell({
								rowIndex: rowIndex + 1,
								colIndex: 0,
							});
					}
					break;
				case 'Escape':
					setFocusedCell(null);
					break;
			}
		},
		[focusedCell, rows.length, columns.length]
	);

	if (rows.length === 0) {
		return (
			<div className="relational-table-empty">
				No results found.
			</div>
		);
	}

	const renderRows = (rowsToRender: typeof table.getRowModel.prototype.rows) =>
		rowsToRender.map((row: any) => (
			<tr key={row.id}>
				{row.getVisibleCells().map((cell: any, colIdx: number) => (
					<td
						key={cell.id}
						onClick={() =>
							setFocusedCell({
								rowIndex: row.index,
								colIndex: colIdx,
							})
						}
						style={{ width: cell.column.getSize() }}
					>
						{flexRender(
							cell.column.columnDef.cell,
							cell.getContext()
						)}
					</td>
				))}
			</tr>
		));

	return (
		<div onKeyDown={handleTableKeyDown} tabIndex={-1}>
			<table
				className="relational-table"
				style={{ width: table.getCenterTotalSize() }}
			>
				<thead>
					{table.getHeaderGroups().map((headerGroup) => (
						<tr key={headerGroup.id}>
							{headerGroup.headers.map((header) => {
								const col = columns.find(c => c.propertyId === header.id);
								return (
									<th
										key={header.id}
										style={{ width: header.getSize() }}
										onContextMenu={(e) => {
											if (col && !col.isQuickActions && !col.isRollup) {
												handleColumnContextMenu(e, header.id, col.displayName, col.columnType);
											}
										}}
									>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef
														.header,
													header.getContext()
											  )}
										<div
											onMouseDown={header.getResizeHandler()}
											onTouchStart={header.getResizeHandler()}
											className={`resize-handle ${
												header.column.getIsResizing()
													? 'resizing'
													: ''
											}`}
										/>
									</th>
								);
							})}
						</tr>
					))}
				</thead>
				<tbody>
					{renderRows(table.getRowModel().rows)}
				</tbody>
				{summaryValues && (
					<tfoot>
						<tr className="summary-row">
							{table
								.getHeaderGroups()[0]
								?.headers.map((header) => (
									<td
										key={header.id}
										className="summary-cell"
									>
										{summaryValues[header.id] != null
											? String(
													summaryValues[header.id]
											  )
											: ''}
									</td>
								))}
						</tr>
					</tfoot>
				)}
			</table>

			{/* Column context menu */}
			{contextMenu && (
				<ColumnContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					columnId={contextMenu.columnId}
					columnName={contextMenu.columnName}
					columnType={contextMenu.columnType}
					currentSort={
						sortConfig.find(s => s.propertyId === contextMenu.columnId)?.direction ?? null
					}
					onClose={closeContextMenu}
					onHideColumn={() => onHideColumn?.(contextMenu.columnId)}
					onSortAsc={() => onSortColumn?.(contextMenu.columnId, 'ASC')}
					onSortDesc={() => onSortColumn?.(contextMenu.columnId, 'DESC')}
					onClearSort={() => onSortColumn?.(contextMenu.columnId, null)}
				/>
			)}
		</div>
	);
}
