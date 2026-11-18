package com.gathin.tvhome;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

/** Plain JVM tests for scene_home: where the row of cards scrolls to and how dark an unfocused card is. */
public class SceneHomeTest {

    @Test
    public void aWhiteBannerFloodsGreyNotWhite() {
        assertEquals(0xFF737373, SceneHome.floodTint(0xFFFFFFFF));
    }

    @Test
    public void aVividColourKeepsItsHueAndIsCappedAtThreeQuartersBrightness() {
        assertEquals(0xFFBF0000, SceneHome.floodTint(0xFFFF0000));
    }

    @Test
    public void aColourDarkerThanItsCapIsLeftAlone() {
        assertEquals(0xFF301020, SceneHome.floodTint(0xFF301020));
        assertEquals(0xFF000000, SceneHome.floodTint(0xFF000000));
    }

    @Test
    public void fullBrightnessNeedsNoLayerAndZeroBrightnessIsBlack() {
        assertEquals(0f, SceneHome.dimAlpha(1f), 0f);
        assertEquals(1f, SceneHome.dimAlpha(0f), 0f);
    }

    @Test
    public void theRestingBrightnessIsAFortyPercentBlackLayer() {
        assertEquals(0.4f, SceneHome.dimAlpha(SceneHome.REST_BRIGHTNESS), 0.0001f);
    }

    @Test
    public void brightnessOutsideZeroToOneIsClamped() {
        assertEquals(0f, SceneHome.dimAlpha(1.7f), 0f);
        assertEquals(1f, SceneHome.dimAlpha(-0.3f), 0f);
    }
}
