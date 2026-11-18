package com.gathin.tvhome;

import android.view.KeyEvent;

/** Key handling while rearranging the native grid. */
final class ReorderKeys {

    enum Mode { BROWSE, CARRY }

    enum Key { OK, BACK, ARROW, OTHER }

    enum Action {
        /** Not ours: the event goes on to the focused view. */
        PASS,
        /** Ours, and nothing happens: the other half of a press, or OK where it has no meaning. */
        CONSUME,
        /** The carried tile moves one step in the arrow's direction. */
        MOVE,
        /** The carried tile is put down; the mode stays on. */
        DROP,
        /** The mode ends and the order is saved. */
        END,
        /** The focused tile is picked up. */
        PICK_UP,
        /** OK on the App library pill: the mode ends, then the library opens. */
        END_AND_OPEN_LIBRARY
    }

    private ReorderKeys() {
    }

    /** BUTTON_A is not OK here: reorder mode never took a gamepad's A as OK. */
    static Key key(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
                return Key.OK;
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
                return Key.BACK;
            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_DPAD_DOWN:
                return Key.ARROW;
            default:
                return Key.OTHER;
        }
    }

    /**
     * @param down      the event is ACTION_DOWN; everything else acts as the release
     * @param released  ACTION_UP and not cancelled (the library pill asks for exactly that)
     * @param onLibrary focus is on the App library pill
     * @param inGrid    focus is somewhere in the grid
     * @param pos       adapter position of the focused tile, or -1 when focus is not on a tile
     */
    static Action decide(Mode mode, Key key, boolean down, boolean released, boolean onLibrary, boolean inGrid,
                         int pos) {
        switch (mode) {
            case CARRY:
                if (key == Key.ARROW) return down ? Action.MOVE : Action.CONSUME;
                if (key == Key.OK || key == Key.BACK) return down ? Action.CONSUME : Action.DROP;
                return Action.PASS;
            case BROWSE:
                if (key == Key.BACK) return down ? Action.CONSUME : Action.END;
                if (key != Key.OK) return Action.PASS;   // arrows navigate
                // The App library pill sits in the grid but is no tile: OK ends the mode (saving the order) and opens it.
                if (onLibrary) return released ? Action.END_AND_OPEN_LIBRARY : Action.CONSUME;
                // RecyclerView can briefly report NO_POSITION during a move or rebind. Still consume
                // OK on the grid: falling through would let the focused card open its app in reorder mode.
                if (inGrid) return !down && pos >= 0 ? Action.PICK_UP : Action.CONSUME;
                return Action.PASS;   // OK on a top-bar pill works as usual
            default:
                return Action.PASS;
        }
    }
}
