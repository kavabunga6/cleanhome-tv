package com.gathin.tvhome;

import org.junit.Test;
import static org.junit.Assert.*;

public class TileFitTest {
    @Test public void gridTilesFitAcrossTheScreenWithFocusRoom() {
        for (int columns = 4; columns <= 7; columns++) {
            int width = AppAdapter.tileWidthPx(920, columns, 1f);
            assertTrue(width * AppAdapter.FOCUS_SCALE <= 920f / columns);
            assertTrue(AppAdapter.tileHeightPx(width) < width);
        }
    }
}
