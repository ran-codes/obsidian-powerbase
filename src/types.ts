import { TFile } from 'obsidian';

/** A single row of table data, keyed by property ID string */
export interface TableRowData {
	/** The source TFile for this entry */
	file: TFile;
	/** Group key for group-by rendering (undefined when ungrouped) */
	groupKey?: string;
	/** Property values keyed by BasesPropertyId string */
	[propertyId: string]: any;
}

/** Parsed wikilink */
export interface WikiLink {
	/** The raw wikilink text e.g. "[[My Note]]" or "[[path/My Note|Display]]" */
	raw: string;
	/** The link path e.g. "My Note" or "path/My Note" */
	path: string;
	/** The display text (alias) if present, otherwise same as path */
	display: string;
	/** The resolved TFile, if it exists in the vault */
	resolvedFile?: TFile;
}

/** Column data type for icon display */
export type ColumnType = 'file' | 'relation' | 'tags' | 'list' | 'checkbox' | 'number' | 'text' | 'date' | 'datetime' | 'rollup' | 'actions';

/** Column metadata for the table */
export interface ColumnMeta {
	/** The Bases property ID string (e.g. "note.tags", "file.name") */
	propertyId: string;
	/** User-facing display name */
	displayName: string;
	/** Whether this column contains relation (wikilink list) values */
	isRelation: boolean;
	/** Whether this is a computed rollup column */
	isRollup?: boolean;
	/** Rollup configuration (present when isRollup is true) */
	rollupConfig?: RollupConfig;
	/** Folder path to filter relation picker options (auto-inferred from property name) */
	relationFolderFilter?: string;
	/** Whether this is a quick actions column */
	isQuickActions?: boolean;
	/** Column data type for header icon */
	columnType?: ColumnType;
}

/** Sort direction */
export interface SortConfig {
	propertyId: string;
	direction: 'ASC' | 'DESC';
}

/** Arguments for the edit engine queue */
export interface EditArgs {
	file: TFile;
	propertyName: string;
	value: any;
}

/** Supported aggregation functions for rollup columns */
export type AggregationType =
	| 'count'
	| 'count_values'
	| 'sum'
	| 'average'
	| 'min'
	| 'max'
	| 'list'
	| 'unique'
	| 'percent_true'
	| 'percent_not_empty';

/** Configuration for a single rollup column */
export interface RollupConfig {
	/** Unique ID for this rollup (e.g. "rollup_1") */
	id: string;
	/** User-facing display name for the column header */
	displayName: string;
	/** Property ID of the relation column to follow */
	relationPropertyId: string;
	/** Frontmatter key to read from each linked note */
	targetProperty: string;
	/** Aggregation function to apply */
	aggregation: AggregationType;
}

/** Focused cell coordinates for keyboard navigation */
export interface FocusedCell {
	rowIndex: number;
	colIndex: number;
}

/** Grouped data from Bases */
export interface GroupData {
	groupKey: string;
	groupValue: any;
	rows: TableRowData[];
}

/** Group metadata passed to the React table component */
export interface GroupInfo {
	key: string;
	label: string;
	startIndex: number;
	count: number;
}

/** Single property update in a quick action */
export interface QuickActionUpdate {
	property: string;
	value: string; // raw value, may contain TODAY/NOW/TRUE/FALSE
}

/** Configuration for a single quick action button */
export interface QuickActionConfig {
	id: string;
	label: string;
	updates: QuickActionUpdate[];
}
