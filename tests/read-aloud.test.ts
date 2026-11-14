import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

function loadReadAloudHelper() {
  const sourcePath = path.resolve(__dirname, '..', 'public/js/read-aloud.js');
  const context = {
    window: {},
    document: {},
    Map,
    Set,
    Array,
    Object,
    String,
    Math,
    RegExp
  };
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  return context.window.NoteBooksReadAloud;
}

describe('Markdown read aloud', () => {
  it('speaks standalone Greek symbols by name without spelling out Greek prose', () => {
    const helper = loadReadAloudHelper();

    expect(helper.normalizeGreekText('α + β', false)).toBe('alpha + beta');
    expect(helper.normalizeGreekText('λόγος', false)).toBe('λόγος');
    expect(helper.normalizeGreekText('λόγος', true)).toBe('lambda omicron gamma omicron final sigma');
  });

  it('turns common Greek and Latin math notation into spoken words', () => {
    const helper = loadReadAloudHelper();

    expect(helper.mathToSpeech('\\alpha + x^2 = \\pi r^2'))
      .toBe('alpha plus ex squared equals pi are squared');
    expect(helper.mathToSpeech('\\Gamma \\times y'))
      .toBe('capital Gamma times why');
  });

  it('prefers a natural voice that matches the user language', () => {
    const helper = loadReadAloudHelper();
    const voices = [
      { name: 'Basic English', lang: 'en-US', voiceURI: 'basic' },
      { name: 'English Neural', lang: 'en-GB', voiceURI: 'neural' },
      { name: 'French Natural', lang: 'fr-FR', voiceURI: 'french' }
    ];

    expect(helper.rankVoices(voices, 'en-US').map((voice) => voice.voiceURI))
      .toEqual(['basic', 'neural', 'french']);
    expect(helper.rankVoices(voices, 'en-GB').map((voice) => voice.voiceURI))
      .toEqual(['neural', 'basic', 'french']);
  });

  it('wires accessible playback and touch controls into both reader shells', () => {
    const framework = path.resolve(__dirname, '..');
    const app = fs.readFileSync(path.join(framework, 'public/js/app.js'), 'utf8');
    const mainShell = fs.readFileSync(path.join(framework, 'index.html'), 'utf8');
    const streamShell = fs.readFileSync(path.join(framework, 'public/html/streams.html'), 'utf8');
    const styles = fs.readFileSync(path.join(framework, 'public/css/style.css'), 'utf8');
    const worker = fs.readFileSync(path.join(framework, 'service-worker.js'), 'utf8');

    expect(app).toContain('window.NoteBooksReadAloud?.attach(toolbar, wrapper)');
    expect(app).toContain("event.key === 'ArrowLeft'");
    expect(app).toContain("event.key === 'ArrowRight'");
    expect(mainShell).toContain('/public/js/read-aloud.js');
    expect(streamShell).toContain('/public/js/read-aloud.js');
    expect(styles).toContain('::highlight(notebooks-speech-word)');
    expect(worker).toContain('public/js/read-aloud.js');
    expect(worker).toContain('webman-v52');
    expect(fs.readFileSync(path.join(framework, 'public/js/read-aloud.js'), 'utf8')).not.toContain('stopButton');
  });
});
