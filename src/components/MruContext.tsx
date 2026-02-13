import { createContext, useContext } from 'react';

export interface MruApi {
	getRecent: (scope: string) => string[];
	recordSelection: (scope: string, notePath: string) => void;
}

export const MruContext = createContext<MruApi | undefined>(undefined);

export function useMru(): MruApi {
	const mru = useContext(MruContext);
	if (!mru) {
		throw new Error('useMru must be used within MruContext.Provider');
	}
	return mru;
}
