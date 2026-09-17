// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { OverflowConnectionTags, splitConnectionTags } from '../../src/CutWorkspace';

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
