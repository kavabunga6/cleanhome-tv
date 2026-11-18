package com.gathin.tvhome;

import static com.gathin.tvhome.ReorderKeys.Action;
import static com.gathin.tvhome.ReorderKeys.Key;
import static com.gathin.tvhome.ReorderKeys.Mode;
import static org.junit.Assert.assertEquals;

import android.view.KeyEvent;

import org.junit.Test;

public class ReorderKeysTest {


    /** A key going down with focus on the tile at pos. */
    private static Action down(Mode mode, Key key, int pos) {
        return ReorderKeys.decide(mode, key, true, false, false, true, pos);
    }

    /** The same key coming up. */
    private static Action up(Mode mode, Key key, int pos) {
        return ReorderKeys.decide(mode, key, false, true, false, true, pos);
    }

    @Test public void okBackAndArrowsAreRecognised() {
        assertEquals(Key.OK, ReorderKeys.key(KeyEvent.KEYCODE_DPAD_CENTER));
        assertEquals(Key.OK, ReorderKeys.key(KeyEvent.KEYCODE_ENTER));
        assertEquals(Key.OK, ReorderKeys.key(KeyEvent.KEYCODE_NUMPAD_ENTER));
        assertEquals(Key.BACK, ReorderKeys.key(KeyEvent.KEYCODE_BACK));
        assertEquals(Key.BACK, ReorderKeys.key(KeyEvent.KEYCODE_ESCAPE));
        assertEquals(Key.ARROW, ReorderKeys.key(KeyEvent.KEYCODE_DPAD_LEFT));
        assertEquals(Key.ARROW, ReorderKeys.key(KeyEvent.KEYCODE_DPAD_RIGHT));
        assertEquals(Key.ARROW, ReorderKeys.key(KeyEvent.KEYCODE_DPAD_UP));
        assertEquals(Key.ARROW, ReorderKeys.key(KeyEvent.KEYCODE_DPAD_DOWN));
    }

    @Test public void volumeHomeAndAGamepadsAAreNotOurs() {
        assertEquals(Key.OTHER, ReorderKeys.key(KeyEvent.KEYCODE_VOLUME_UP));
        assertEquals(Key.OTHER, ReorderKeys.key(KeyEvent.KEYCODE_HOME));
        assertEquals(Key.OTHER, ReorderKeys.key(KeyEvent.KEYCODE_BUTTON_A));
    }

    // ---- off ----

    @Test public void arrowsMoveTheCarriedTileOnDownOnly() {
        assertEquals(Action.MOVE, down(Mode.CARRY, Key.ARROW, 3));
        assertEquals(Action.CONSUME, up(Mode.CARRY, Key.ARROW, 3));
    }

    @Test public void okOrBackPutsTheCarriedTileDownOnRelease() {
        assertEquals(Action.CONSUME, down(Mode.CARRY, Key.OK, 3));
        assertEquals(Action.DROP, up(Mode.CARRY, Key.OK, 3));
        assertEquals(Action.CONSUME, down(Mode.CARRY, Key.BACK, 3));
        assertEquals(Action.DROP, up(Mode.CARRY, Key.BACK, 3));
    }

    @Test public void otherKeysPassWhileCarrying() {
        assertEquals(Action.PASS, down(Mode.CARRY, Key.OTHER, 3));
        assertEquals(Action.PASS, up(Mode.CARRY, Key.OTHER, 3));
    }

    // ---- browsing ----

    @Test public void backEndsTheModeOnRelease() {
        assertEquals(Action.CONSUME, down(Mode.BROWSE, Key.BACK, 3));
        assertEquals(Action.END, up(Mode.BROWSE, Key.BACK, 3));
    }

    @Test public void okPicksUpTheFocusedTileOnRelease() {
        assertEquals(Action.CONSUME, down(Mode.BROWSE, Key.OK, 3));
        assertEquals(Action.PICK_UP, up(Mode.BROWSE, Key.OK, 3));
    }

    @Test public void okOnTheGridWithNoPositionIsEatenSoTheAppDoesNotOpen() {
        assertEquals(Action.CONSUME, down(Mode.BROWSE, Key.OK, -1));
        assertEquals(Action.CONSUME, up(Mode.BROWSE, Key.OK, -1));
    }

    @Test public void okOnTheLibraryPillEndsTheModeAndOpensTheLibrary() {
        assertEquals(Action.CONSUME,
                ReorderKeys.decide(Mode.BROWSE, Key.OK, true, false, true, true, -1));
        assertEquals(Action.END_AND_OPEN_LIBRARY,
                ReorderKeys.decide(Mode.BROWSE, Key.OK, false, true, true, true, -1));
    }

    @Test public void aCancelledOkOnTheLibraryPillOpensNothing() {
        assertEquals(Action.CONSUME,
                ReorderKeys.decide(Mode.BROWSE, Key.OK, false, false, true, true, -1));
    }

    @Test public void okOnATopBarPillWorksAsUsual() {
        assertEquals(Action.PASS,
                ReorderKeys.decide(Mode.BROWSE, Key.OK, true, false, false, false, -1));
        assertEquals(Action.PASS,
                ReorderKeys.decide(Mode.BROWSE, Key.OK, false, true, false, false, -1));
    }

    @Test public void arrowsAndOtherKeysNavigateWhileBrowsing() {
        assertEquals(Action.PASS, down(Mode.BROWSE, Key.ARROW, 3));
        assertEquals(Action.PASS, up(Mode.BROWSE, Key.ARROW, 3));
        assertEquals(Action.PASS, down(Mode.BROWSE, Key.OTHER, 3));
    }


}
