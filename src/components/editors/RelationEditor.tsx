import React, { useState, useEffect, useCallback } from 'react';
import CreatableSelect from 'react-select/creatable';
import type { MultiValue, ActionMeta } from 'react-select';
import { ClickAwayListener } from '@mui/material';
import { useApp } from '../AppContext';
import { NoteSearchService } from '../../services/NoteSearchService';
import { ParseService } from '../../services/ParseService';
import type { WikiLink } from '../../types';

interface OptionType {
	label: string;
	value: string;
}

interface RelationEditorProps {
	currentLinks: WikiLink[];
	onDone: (newLinks: string[]) => void;
	onCancel: () => void;
	/** If set, only show notes under this folder path in the picker */
	folderFilter?: string;
}

/**
 * Relation picker editor using react-select CreatableSelect.
 * Adopts the DB Folder proven pattern:
 * - Multi-select with portal rendering
 * - Click-away to persist
 * - Creatable for inline note creation
 */
export function RelationEditor({
	currentLinks,
	onDone,
	onCancel,
	folderFilter,
}: RelationEditorProps) {
	const app = useApp();

	// Convert current links to react-select options
	const [selected, setSelected] = useState<OptionType[]>(
		currentLinks.map((link) => ({
			label: link.display,
			value: link.path,
		}))
	);

	// Available notes as options
	const [options, setOptions] = useState<OptionType[]>([]);

	useEffect(() => {
		const allNotes = NoteSearchService.getAllNotes(app, folderFilter);
		setOptions(
			allNotes.map((file) => ({
				label: file.basename,
				value: file.path.replace(/\.md$/, ''),
			}))
		);
	}, [app, folderFilter]);

	const handleChange = useCallback(
		async (
			newValue: MultiValue<OptionType>,
			actionMeta: ActionMeta<OptionType>
		) => {
			if (actionMeta.action === 'create-option' && actionMeta.option) {
				// Create a new note
				const noteName = actionMeta.option.label;
				try {
					const newFile = await app.vault.create(
						`${noteName}.md`,
						''
					);
					const newOption: OptionType = {
						label: newFile.basename,
						value: newFile.path.replace(/\.md$/, ''),
					};
					// Replace the created option with the resolved one
					const updated = [...newValue].map((v) =>
						v.value === actionMeta.option!.value ? newOption : v
					);
					setSelected(updated as OptionType[]);

					// Add to available options
					setOptions((prev) => [...prev, newOption]);
				} catch (err) {
					console.error(
						'[Bases Power User] Failed to create note:',
						err
					);
				}
			} else {
				setSelected([...(newValue as OptionType[])]);
			}
		},
		[app]
	);

	const handleClickAway = useCallback(() => {
		// Convert selected options to wikilink strings
		const newLinks = selected.map((opt) =>
			ParseService.formatAsWikiLink(opt.value)
		);
		onDone(newLinks);
	}, [selected, onDone]);

	return (
		<ClickAwayListener onClickAway={handleClickAway}>
			<div className="relation-editor">
				<CreatableSelect<OptionType, true>
					isMulti
					closeMenuOnSelect={false}
					isSearchable
					autoFocus
					menuPosition="fixed"
					menuPortalTarget={document.body}
					components={{
						DropdownIndicator: () => null,
						IndicatorSeparator: () => null,
					}}
					styles={{
						control: (base) => ({
							...base,
							minHeight: '20px',
							height: '20px',
							fontSize: 'var(--font-smallest)',
							backgroundColor: 'var(--background-primary)',
							borderColor: 'var(--background-modifier-border)',
						}),
						valueContainer: (base) => ({
							...base,
							padding: '0 4px',
							height: '18px',
						}),
						indicatorsContainer: (base) => ({
							...base,
							height: '18px',
						}),
						menu: (base) => ({
							...base,
							backgroundColor: 'var(--background-primary)',
							border: '1px solid var(--background-modifier-border)',
							zIndex: 9999,
						}),
						option: (base, state) => ({
							...base,
							backgroundColor: state.isFocused
								? 'var(--background-modifier-hover)'
								: 'transparent',
							color: 'var(--text-normal)',
							fontSize: 'var(--font-ui-small)',
						}),
						multiValue: (base) => ({
							...base,
							backgroundColor:
								'var(--background-modifier-hover)',
							borderRadius: '12px',
							height: '16px',
							margin: '1px 2px',
						}),
						multiValueLabel: (base) => ({
							...base,
							color: 'var(--text-accent)',
							fontSize: 'var(--font-smallest)',
							padding: '0 4px',
							lineHeight: '16px',
						}),
						multiValueRemove: (base) => ({
							...base,
							color: 'var(--text-faint)',
							':hover': {
								backgroundColor:
									'var(--background-modifier-active-hover)',
								color: 'var(--text-error)',
							},
						}),
						input: (base) => ({
							...base,
							color: 'var(--text-normal)',
						}),
						placeholder: (base) => ({
							...base,
							color: 'var(--text-faint)',
						}),
					}}
					options={options}
					value={selected}
					onChange={handleChange}
					placeholder="Search notes..."
					formatCreateLabel={(inputValue) =>
						`Create "${inputValue}"`
					}
				/>
			</div>
		</ClickAwayListener>
	);
}
