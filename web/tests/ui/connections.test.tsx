// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import CutWorkspace, { OverflowConnectionTags, splitConnectionTags } from '../../src/CutWorkspace';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

describe('connection UI', () => {
  it('renders the cut workspace when structured roles are stored as sets', () => {
    const cardData = {
      cacheKey: 'test-card',
      id: 'test-card',
      name: 'Test Counterspell',
      nameKey: 'test counterspell',
      type: 'Instant',
      typeLine: 'Instant',
      manaCost: '{U}{U}',
      manaValue: 2,
      colors: ['U'],
      colorIdentity: ['U'],
      oracleText: 'Counter target spell.',
      scryfallUri: '',
      fetchedAt: 0,
    };
    expect(() =>
      render(
        <CutWorkspace
          deckName="Test deck"
          formatLabel="Commander"
          commander=""
          cards={[{ name: cardData.name, quantity: 1, cardData }]}
          cardCount={1}
          target={100}
          contextualPopularity={new Map()}
          onCardQuantityChange={() => {}}
          onBack={() => {}}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByText('Make cuts')).toBeTruthy();
  });

  it('offers every basic land outside Commander and can add a missing one', () => {
    const onCardQuantityChange = vi.fn();
    const view = render(
      <CutWorkspace
        deckName="Standard deck"
        formatLabel="Standard"
        commander=""
        cards={[]}
        cardCount={0}
        target={60}
        contextualPopularity={new Map()}
        onCardQuantityChange={onCardQuantityChange}
        onBack={() => {}}
      />,
    );
    const panel = within(view.container);
    expect(panel.getByLabelText('Add one Plains')).toBeTruthy();
    expect(panel.getByLabelText('Add one Island')).toBeTruthy();
    expect(panel.getByLabelText('Add one Swamp')).toBeTruthy();
    expect(panel.getByLabelText('Add one Mountain')).toBeTruthy();
    expect(panel.getByLabelText('Add one Forest')).toBeTruthy();
    expect(panel.getByLabelText('Add one Wastes')).toBeTruthy();
    fireEvent.click(panel.getByLabelText('Add one Plains'));
    expect(onCardQuantityChange).toHaveBeenCalledWith(
      'basic:plains',
      1,
      expect.objectContaining({ name: 'Plains', quantity: 0 }),
    );
  });

  it('keeps themes and roles in separate collections', () => {
    expect(splitConnectionTags(['treasure count', 'card draw', 'removal'])).toEqual({
      themes: ['treasure count'],
      roles: ['card draw', 'removal'],
    });
  });

  it('collapses overflow into a more menu without losing hidden choices', () => {
    const onSelect = vi.fn();
    render(
      <div style={{ width: 1 }}>
        <OverflowConnectionTags
          tags={['Clue', 'Sacrifice', 'Drain']}
          renderTag={(tag) => <span>{tag}</span>}
          onSelect={onSelect}
          moreClassName=""
        />
      </div>,
    );
    expect(screen.getByText(/\+\d+ more…/)).toBeTruthy();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(screen.getAllByText('Clue').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sacrifice').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Drain').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('menuitem')[0]);
    expect(onSelect).toHaveBeenCalledWith('Sacrifice');
  });
});
