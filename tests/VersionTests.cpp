#include <catch2/catch_test_macros.hpp>

#include <Version.h>

TEST_CASE ("The core reports the project version", "[version]")
{
    CHECK (diffuscore::version() == "0.1.0");
}
