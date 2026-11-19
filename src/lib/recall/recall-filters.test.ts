import {
  DEFAULT_RECALL_FILTERS,
  attemptsQuery,
  parseRecallFilters,
  recallFiltersQuery,
} from './recall-filters';

describe('filtros de la lista de recall en la URL (DX-465)', () => {
  it('sin query: los valores por defecto, y los por defecto no ensucian la URL', () => {
    expect(parseRecallFilters(new URLSearchParams(''))).toEqual(DEFAULT_RECALL_FILTERS);
    expect(recallFiltersQuery(DEFAULT_RECALL_FILTERS)).toBe('');
  });

  it('ida y vuelta de todos los filtros', () => {
    const filters = {
      view: 'due' as const,
      typeRef: 't-perio',
      soon: true,
      sort: 'LEAST_OVERDUE' as const,
      attempts: 'exhausted' as const,
      page: 3,
    };
    const query = recallFiltersQuery(filters);
    expect(query).toBe('tipo=t-perio&ventana=proximos&orden=menos&intentos=agotados&page=3');
    expect(parseRecallFilters(new URLSearchParams(query))).toEqual(filters);
    expect(parseRecallFilters(new URLSearchParams('intentos=contactados')).attempts).toBe('contacted');
    expect(parseRecallFilters(new URLSearchParams('vista=sin-recall')).view).toBe('unconfigured');
  });

  it('lo que no se entiende cae al valor por defecto', () => {
    expect(parseRecallFilters(new URLSearchParams('intentos=todos&page=-2&orden=x'))).toEqual(DEFAULT_RECALL_FILTERS);
  });

  it('qué pide cada filtro de intentos a GET /recall/due', () => {
    expect(attemptsQuery('due')).toEqual({});
    expect(attemptsQuery('contacted')).toEqual({ includeContacted: true });
    expect(attemptsQuery('exhausted')).toEqual({ exhausted: true });
  });
});
