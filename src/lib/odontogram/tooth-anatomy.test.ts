import {
  TOOTH_WIDTH,
  toothArch,
  toothChartSide,
  toothClass,
  toothPosition,
  toothQuadrant,
  toothTransform,
  toothWidth,
  surfaceMirror,
} from './tooth-anatomy';
import { ALL_PERMANENT } from './fdi';

describe('tooth-anatomy', () => {
  it('reads the quadrant and position off the FDI digits', () => {
    expect(toothQuadrant('18')).toBe(1);
    expect(toothPosition('18')).toBe(8);
    expect(toothQuadrant('41')).toBe(4);
    expect(toothPosition('41')).toBe(1);
  });

  it('classifies every permanent tooth by position', () => {
    expect(toothClass('11')).toBe('incisor'); // central incisor
    expect(toothClass('12')).toBe('incisor'); // lateral incisor
    expect(toothClass('13')).toBe('canine');
    expect(toothClass('14')).toBe('premolar');
    expect(toothClass('15')).toBe('premolar');
    expect(toothClass('16')).toBe('molar');
    expect(toothClass('18')).toBe('molar');
  });

  it('splits the arches by quadrant', () => {
    expect(toothArch('11')).toBe('upper');
    expect(toothArch('28')).toBe('upper');
    expect(toothArch('31')).toBe('lower');
    expect(toothArch('48')).toBe('lower');
  });

  it("maps quadrants onto chart halves from the viewer's side of the chair", () => {
    // Patient's right (quadrants 1 and 4) is drawn on the chart's LEFT.
    expect(toothChartSide('11')).toBe('left');
    expect(toothChartSide('48')).toBe('left');
    expect(toothChartSide('21')).toBe('right');
    expect(toothChartSide('38')).toBe('right');
  });

  it('widens the tooth by class so the row reads as an arch, not 32 squares', () => {
    expect(toothWidth('11')).toBe(TOOTH_WIDTH.incisor);
    expect(toothWidth('16')).toBe(TOOTH_WIDTH.molar);
    expect(toothWidth('16')).toBeGreaterThan(toothWidth('14'));
    expect(toothWidth('14')).toBeGreaterThan(toothWidth('13'));
    expect(toothWidth('13')).toBeGreaterThan(toothWidth('11'));
  });

  describe('surface orientation', () => {
    it('leaves quadrant 2 unmirrored — the geometry is authored in its orientation', () => {
      expect(surfaceMirror('21')).toEqual({ scaleX: 1, scaleY: 1 });
      expect(toothTransform('21')).toBeUndefined();
    });

    it('mirrors the lower arch vertically so vestibular faces away from the occlusal plane', () => {
      expect(surfaceMirror('31').scaleY).toBe(-1);
      expect(surfaceMirror('38').scaleY).toBe(-1);
      expect(surfaceMirror('11').scaleY).toBe(1);
    });

    it("mirrors the chart's left half horizontally so mesial always faces the midline", () => {
      expect(surfaceMirror('11').scaleX).toBe(-1); // quadrant 1, left half
      expect(surfaceMirror('48').scaleX).toBe(-1); // quadrant 4, left half
      expect(surfaceMirror('21').scaleX).toBe(1);
      expect(surfaceMirror('31').scaleX).toBe(1);
    });

    it('translates before scaling so a mirrored group stays inside the 40×40 viewBox', () => {
      expect(toothTransform('11')).toBe('translate(40, 0) scale(-1, 1)'); // upper right
      expect(toothTransform('31')).toBe('translate(0, 40) scale(1, -1)'); // lower left
      expect(toothTransform('41')).toBe('translate(40, 40) scale(-1, -1)'); // lower right
    });

    it('resolves a width and an orientation for all 32 permanent teeth', () => {
      for (const fdi of ALL_PERMANENT) {
        expect(toothWidth(fdi)).toBeGreaterThan(0);
        expect([1, -1]).toContain(surfaceMirror(fdi).scaleX);
        expect([1, -1]).toContain(surfaceMirror(fdi).scaleY);
      }
    });
  });
});
