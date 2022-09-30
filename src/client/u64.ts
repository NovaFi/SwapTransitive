//@ts-ignore
import assert from 'assert';
//@ts-ignore
import BN from 'bn.js';
import { Buffer } from 'buffer';
/**
 * 64-bit value
*/
 export class u64 extends BN {
    /**
     * Convert to Buffer representation
     */
    toBuffer(): any {
        const a = super.toArray().reverse();
        const b = Buffer.from(a);
        if (b.length === 8) {
            return b;
        }
        assert(b.length < 8, 'u64 too large');

        const zeroPad = Buffer.alloc(8);
        b.copy(zeroPad);
        return zeroPad;
    }

    /**
     * Construct a u64 from Buffer representation
     */
    static fromBuffer(buffer: any): u64 {
        assert(buffer.length === 8, `Invalid buffer length: ${buffer.length}`);
        return new u64(
            //@ts-ignore
            [...buffer]
                .reverse()
                .map(i => `00${i.toString(16)}`.slice(-2))
                .join(''),
            16,
        );
    }
}