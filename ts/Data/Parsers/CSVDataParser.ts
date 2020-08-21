/* *
 *
 *  Data Layer
 *
 *  (c) 2012-2020 Torstein Honsi
 *
 *  License: www.highcharts.com/license
 *
 *  !!!!!!! SOURCE GETS TRANSPILED BY TYPESCRIPT. EDIT TS FILE ONLY. !!!!!!!
 *
 * */

import type DataValueType from '../DataValueType.js';
import DataJSON from '../DataJSON.js';
import DataParser from './DataParser.js';
import DataTable from '../DataTable.js';
import U from '../../Core/Utilities.js';

const { merge } = U;

/* eslint-disable no-invalid-this, require-jsdoc, valid-jsdoc */

/**
 * Handles parsing and transforming CSV to a DataTable
 */
class CSVDataParser extends DataParser<DataParser.EventObject> {

    /* *
     *
     *  Static Properties
     *
     * */

    /**
     * Default options
     */
    protected static readonly defaultOptions: CSVDataParser.ClassJSONOptions = {
        ...DataParser.defaultOptions,
        decimalPoint: '.',
        lineDelimiter: '\n'
    };

    /* *
     *
     *  Static Functions
     *
     * */

    /**
     * Creates a CSVDataParser instance from ClassJSON.
     *
     * @param {CSVDataParser.ClassJSON} json
     * Class JSON to convert to the parser instance.
     *
     * @return {CSVDataParser}
     * An instance of CSVDataParser.
     */
    public static fromJSON(json: CSVDataParser.ClassJSON): CSVDataParser {
        return new CSVDataParser(json.options);
    }

    /* *
     *
     *  Constructor
     *
     * */

    /**
     * Constructs an instance of the CSV parser.
     *
     * @param {CSVDataParser.ClassJSONOptions} [options]
     * Options for the CSV parser.
     */
    public constructor(options?: CSVDataParser.OptionsType) {
        super();

        this.options = merge(CSVDataParser.defaultOptions, options);
    }

    /* *
     *
     *  Properties
     *
     * */
    private columns: Array<Array<DataValueType>> = [];
    private headers: Array<string> = [];
    private guessedItemDelimiter?: string;
    private guessedDecimalPoint?: string;
    private decimalRegex?: RegExp;
    private options: CSVDataParser.ClassJSONOptions;


    /**
     * Initiates parsing of CSV
     *
     * @param {CSVDataParser.OptionsType}[options]
     * Options for the parser
     *
     * @emits CSVDataParser#parse
     * @emits CSVDataParser#afterParse
     */
    public parse(
        options: CSVDataParser.OptionsType
    ): void {
        const parser = this,
            parserOptions = merge(this.options, options),
            {
                beforeParse,
                lineDelimiter,
                firstRowAsNames,
                itemDelimiter
            } = parserOptions;

        let lines,
            rowIt = 0,
            {
                csv,
                startRow,
                endRow
            } = parserOptions,
            i: number,
            colsCount: number;

        this.columns = [];

        this.emit({ type: 'parse', columns: parser.columns, headers: parser.headers });

        if (csv && beforeParse) {
            csv = beforeParse(csv);
        }

        if (csv) {
            lines = csv
                .replace(/\r\n/g, '\n') // Unix
                .replace(/\r/g, '\n') // Mac
                .split(lineDelimiter);

            if (!startRow || startRow < 0) {
                startRow = 0;
            }

            if (!endRow || endRow >= lines.length) {
                endRow = lines.length - 1;
            }

            if (!itemDelimiter) {
                parser.guessedItemDelimiter = parser.guessDelimiter(lines);
            }

            var offset = 0;

            for (rowIt = startRow; rowIt <= endRow; rowIt++) {
                if (lines[rowIt][0] === '#') {
                    offset++;
                } else {
                    parser.parseCSVRow(lines[rowIt], rowIt - startRow - offset);
                }
            }
        }

        if (firstRowAsNames && parser.columns) {
            colsCount = parser.columns.length;

            for (i = 0; i < colsCount; i++) {
                if (!parser.headers) {
                    parser.headers = [];
                }
                parser.headers[i] = '' + parser.columns[i][0];
            }
        }

        parser.emit({ type: 'afterParse', columns: parser.columns, headers: parser.headers });
    }

    /**
     * Internal method that parses a single CSV row
     */
    private parseCSVRow(
        columnStr: string,
        rowNumber: number
    ): void {
        const parser = this,
            columns = parser.columns || [],
            { startColumn, endColumn } = parser.options,
            itemDelimiter = parser.options.itemDelimiter || parser.guessedItemDelimiter;
        let i = 0,
            c = '',
            cl = '',
            cn = '',
            token = '',
            actualColumn = 0,
            column = 0;

        /**
         * @private
         */
        function read(j: number): void {
            c = columnStr[j];
            cl = columnStr[j - 1];
            cn = columnStr[j + 1];
        }

        /**
         * @private
         */
        function push(): void {
            if (startColumn > actualColumn || actualColumn > endColumn) {
                // Skip this column, but increment the column count (#7272)
                ++actualColumn;
                token = '';
                return;
            }

            if (columns.length < column + 1) {
                columns.push([]);
            }


            columns[column][rowNumber] = token;

            token = '';
            ++column;
            ++actualColumn;
        }

        if (!columnStr.trim().length) {
            return;
        }

        if (columnStr.trim()[0] === '#') {
            return;
        }

        for (; i < columnStr.length; i++) {
            read(i);

            // Quoted string
            if (c === '#') {
                // The rest of the row is a comment
                push();
                return;
            }

            if (c === '"') {
                read(++i);

                while (i < columnStr.length) {
                    if (c === '"' && cl !== '"' && cn !== '"') {
                        break;
                    }

                    if (c !== '"' || (c === '"' && cl !== '"')) {
                        token += c;
                    }

                    read(++i);
                }

            } else if (c === itemDelimiter) {
                push();

                // Actual column data
            } else {
                token += c;
            }
        }

        push();

    }

    /**
     * Internal method that guesses the delimiter from the first
     * 13 lines of the CSV
     * @param {Array<string>} lines
     * The CSV, split into lines
     */
    private guessDelimiter(lines: Array<string>): string {

        const { decimalPoint } = this.options;
        var points = 0,
            commas = 0,
            guessed: string;
        const potDelimiters: Record<string, number> = {
                ',': 0,
                ';': 0,
                '\t': 0
            },
            linesCount = lines.length;

        for (let i = 0; i < linesCount; i++) {
            var inStr = false,
                c,
                cn,
                cl,
                token = '';

            // We should be able to detect dateformats within 13 rows
            if (i > 13) {
                break;
            }

            const columnStr = lines[i];
            for (var j = 0; j < columnStr.length; j++) {
                c = columnStr[j];
                cn = columnStr[j + 1];
                cl = columnStr[j - 1];

                if (c === '#') {
                    // Skip the rest of the line - it's a comment
                    break;
                }

                if (c === '"') {
                    if (inStr) {
                        if (cl !== '"' && cn !== '"') {
                            while (cn === ' ' && j < columnStr.length) {
                                cn = columnStr[++j];
                            }

                            // After parsing a string, the next non-blank
                            // should be a delimiter if the CSV is properly
                            // formed.

                            if (typeof potDelimiters[cn] !== 'undefined') {
                                potDelimiters[cn]++;
                            }

                            inStr = false;
                        }
                    } else {
                        inStr = true;
                    }
                } else if (typeof potDelimiters[c] !== 'undefined') {

                    token = token.trim();

                    if (!isNaN(Date.parse(token))) {
                        potDelimiters[c]++;
                    } else if (
                        isNaN(Number(token)) ||
                        !isFinite(Number(token))
                    ) {
                        potDelimiters[c]++;
                    }

                    token = '';

                } else {
                    token += c;
                }

                if (c === ',') {
                    commas++;
                }

                if (c === '.') {
                    points++;
                }
            }
        }

        // Count the potential delimiters.
        // This could be improved by checking if the number of delimiters
        // equals the number of columns - 1

        if (potDelimiters[';'] > potDelimiters[',']) {
            guessed = ';';
        } else if (potDelimiters[','] > potDelimiters[';']) {
            guessed = ',';
        } else {
            // No good guess could be made..
            guessed = ',';
        }

        // Try to deduce the decimal point if it's not explicitly set.
        // If both commas or points is > 0 there is likely an issue
        if (!decimalPoint) {
            if (points > commas) {
                this.guessedDecimalPoint = '.';
            } else {
                this.guessedDecimalPoint = ',';
            }

            // Apply a new decimal regex based on the presumed decimal sep.
            this.decimalRegex = new RegExp(
                '^(-?[0-9]+)' +
                decimalPoint +
                '([0-9]+)$'
            );
        }

        return guessed;
    }
    /**
     * Handles converting the parsed data to a DataTable
     *
     * @returns {DataTable}
     * A DataTable from the parsed CSV
     */
    public getTable(): DataTable {
        return DataTable.fromColumns(this.columns, this.headers);
    }

    /**
     * Converts the parser instance to ClassJSON.
     *
     * @returns {CSVDataParser.ClassJSON}
     * ClassJSON from the parser instance.
     */
    public toJSON(): CSVDataParser.ClassJSON {
        const parser = this,
            {
                options
            } = parser,
            json: CSVDataParser.ClassJSON = {
                $class: 'CSVDataParser',
                options
            };

        return json;
    }
}

namespace CSVDataParser {

    /**
     * ClassJSON for CSVDataParser
     */
    export interface ClassJSON extends DataJSON.ClassJSON {
        options: ClassJSONOptions;
    }

    /**
     * Interface for the BeforeParse callback function
     *
     */
    export interface DataBeforeParseCallbackFunction {
        (csv: string): string;
    }

    /**
     * All available options for the parser
     */
    export type OptionsType = Partial<ClassJSONOptions & ParserOptions>;

    /**
     * Options for the CSV parser that are compatible with ClassJSON
     */
    export interface ClassJSONOptions extends DataParser.Options {
        csv?: string;
        decimalPoint: string;
        itemDelimiter?: string;
        lineDelimiter: string;
    }

    /**
     * Options that are not compatible with ClassJSON
     */
    export interface ParserOptions {
        beforeParse?: DataBeforeParseCallbackFunction;
        decimalRegex?: RegExp;
    }
}

/* *
 *
 *  Register
 *
 * */

DataJSON.addClass(CSVDataParser);

/* *
 *
 *  Export
 *
 * */

export default CSVDataParser;