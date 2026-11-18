package com.gathin.tvhome;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class OrderTest {
    @Test public void migratesBothLegacyHeadersAndWritesOnlyComponentKeys() {
        List<String> keys = Arrays.asList("b/.TV", "a/.TV");
        for (String metadata : Arrays.asList("dock a,b\n", "dock a,b\ndocked 1\n")) {
            Order order = Order.decode("tvhome-order 1\n" + metadata + "b/.TV\na/.TV\n");
            assertEquals(keys, order.keys);
            assertEquals("tvhome-order 2\nb/.TV\na/.TV\n", Order.encode(order));
            assertEquals(keys, Order.decode(Order.encode(order)).keys);
            assertTrue(Order.compare(Order.ranks(order), "a/.TV", "new/.TV") < 0);
        }
    }

    @Test public void handlesEmptyAndRejectsDuplicateOrTruncatedKeys() {
        assertTrue(Order.decode("tvhome-order 2\n").keys.isEmpty());
        assertNull(Order.decode("tvhome-order 2\na\na\n"));
        assertNull(Order.decode("tvhome-order 2\na\n\nb\n"));
        assertNull(Order.decode("wrong version"));
        assertNull(Order.decode("tvhome-order 1\ndock a\ndocked 2\na\n"));
        assertNull(Order.decode("tvhome-order 1\ndock a\ndocked invalid\na\n"));
    }
}
