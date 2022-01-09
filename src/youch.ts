import { readFileSync, promises } from 'fs';
import { join, isAbsolute, sep } from 'path';
import { parse } from 'cookie';
import mustache from 'mustache';
import StackTracey from 'stacktracey';
import type { Request } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const viewTemplate = readFileSync(join(__dirname, './error.compiled.mustache'), 'utf-8');

interface SourceCode {
  pre: string[];
  line: string;
  post: string[];
}

interface Context {
  start: number;
  pre: string;
  line: string;
  post: string;
}

type Frame = StackTracey.Entry & {
  context?: SourceCode;
};

type SerializedFrame = {
  file: string;
  filePath: string;
  line?: number;
  callee: string;
  calleeShort: string;
  column?: number;
  context?: Context;
  isModule: boolean;
  isNative: boolean;
  isApp: boolean;
}

type Error = NodeJS.ErrnoException & {
  status?: number;
} 

export class Youch {
  codeContext: number;
  _filterHeaders: string[];
  error: Error;
  request: Request;
  links: any[];

  constructor(error: Error, request: Request) {
    this.codeContext = 5;
    this._filterHeaders = ['cookie', 'connection'];
    this.error = error;
    this.request = request;
    this.links = [];
  }

  /**
   * Returns the source code for a given file.
   */
  async _getFrameSource(frame: Frame): Promise<SourceCode | undefined> {
    try {
      const path = frame.file
        .replace(/dist\/webpack:\//g, '') // unix
        .replace(/dist\\webpack:\\/g, '') // windows
        .replace('file://', '') // ESM file paths

      const contents = await promises.readFile(path, 'utf-8');
      const lines = contents.split(/\r?\n/);
      const lineNumber = frame.line;

      if (!lineNumber) throw new Error('Missing "lineNumber" in frame');

      return {
        pre: lines.slice(
          Math.max(0, lineNumber - (this.codeContext + 1)),
          lineNumber - 1
        ),
        line: lines[lineNumber - 1],
        post: lines.slice(lineNumber, lineNumber + this.codeContext)
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Parses the error stack and returns serialized frames out of it.
   */
  async _parseError(): Promise<(Frame | (Frame & Context | {}))[]> {
    const stack = new StackTracey(this.error)
    return Promise.all(stack.items.map(async frame => {
      if (this._isBuiltIn(frame)) return frame;
      const context = await this._getFrameSource(frame) ?? undefined;
      return {
        ...frame,
        context
      };
    }));
  }

  /**
   * Returns the context with code for a given frame.
   */
  _getContext(frame: Frame): Context | undefined {
    if (!frame.context || !frame.line) return undefined;

    return {
      start: frame.line - (frame.context.pre || []).length,
      pre: frame.context.pre.join('\n'),
      line: frame.context.line,
      post: frame.context.post.join('\n')
    }
  }

  /**
   * Returns classes to be used inside HTML when displaying the frames list.
   */
  _getDisplayClasses(frame: SerializedFrame, index: number) {
    return [
      ...(index === 0 ? ['active'] : ['']),
      ...(frame.isApp ? ['app-frame'] : ['native-frame'])
    ].join(' ');
  }

  /**
   * Compiles the view using HTML
   */
  _compileView(view: string, data?: Record<string, unknown>) {
    return mustache.render(view, data);
  }

  /**
   * Serializes frame to a usable error object.
   */
  _serializeFrame(frame: Frame): SerializedFrame {
    return {
      file: frame.fileRelative,
      filePath: frame.file,
      line: frame.line,
      callee: frame.callee,
      calleeShort: frame.calleeShort,
      column: frame.column,
      context: this._getContext(frame),
      isModule: frame.thirdParty,
      isNative: frame.native,
      isApp: this._isApp(frame)
    }
  }

  /**
   * Returns whether frame belongs to nodejs.
   */
  _isBuiltIn(frame: Frame) {
    if (frame.native) return true;

    if (frame.file.startsWith('file://')) return false;

    const filename = frame.file || '';
    return !isAbsolute(filename) && filename[0] !== '.';
  }

  /**
   * Returns whether code belongs to the app.
   */
  _isApp(frame: Frame) {
    return !this._isBuiltIn(frame) && !this._isNodeModule(frame);
  }

  /**
   * Returns whether frame belongs to /node_modules/.
   */
  _isNodeModule(frame: Frame) {
    return (frame.file || '').indexOf('node_modules' + sep) > -1;
  }

  /**
   * Serializes stack to Mustache friendly object to be used within the view.
   * Optionally can pass a callback to customize the frames output.
   */
  _serializeData(stack: ({} | Frame | (StackTracey.Entry & {
    context?: Context;
} & Context))[], callback?: (frame: Frame, index: number, array: any[]) => void) {
    return {
      message: this.error.message,
      name: this.error.name,
      status: this.error.status,
      frames: Array.isArray(stack) ? stack.filter(frame => (frame as Frame).file).map(callback ?? this._serializeFrame.bind(this)) : []
    }
  }

  /**
   * Returns a serialized object with important information.
   */
  _serializeRequest() {
    const headers = Object.keys(this.request.headers)
      .filter(key => this._filterHeaders.indexOf(key) > -1)
      .map(key => ({
        key: key.toUpperCase(),
        value: this.request.headers[key]
      }));

    const parsedCookies = parse(this.request.headers.cookie || '')
    const cookies = Object.keys(parsedCookies).map(key => ({ key, value: parsedCookies[key] }))

    return {
      url: this.request.url,
      httpVersion: this.request.httpVersion,
      method: this.request.method,
      connection: this.request.headers.connection,
      headers,
      cookies
    }
  }

  /**
   * Stores the link `callback` which will be processed when rendering the HTML view.
   */
  addLink(callback: () => void) {
    if (typeof callback !== 'function') throw new Error('Pass a callback function to "addLink"');

    this.links.push(callback);
    return this;
  }

  /**
   * Returns error stack as JSON.
   */
  async toJSON() {
    const stack = await this._parseError()
    return {
      error: this._serializeData(stack)
    };
  }

  /**
   * Returns HTML representation of the error stack by parsing the stack into frames and getting important info out of it.
   */
  async toHTML() {
    const stack = await this._parseError();
    const data = this._serializeData(stack, (frame, index) => {
      const serializedFrame = this._serializeFrame(frame);
      return {
        ...serializedFrame,
        classes: this._getDisplayClasses(serializedFrame, index),
      }
    });

    const links = this.links.map(renderLink => renderLink(data));

    return this._compileView(viewTemplate, {
      links,
      loadFA: !!links.find(link => link.includes('fa-')),
      request: this.request ? this._serializeRequest() : undefined,
      ...data,
    });
  }
}
