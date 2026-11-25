add_executable(diffuscore_tests
    AvailableMemoryTests.cpp
    FollowTests.cpp
    OverviewTests.cpp
    PreferencesTests.cpp
    SourceLoadingTests.cpp
    SpectrogramTests.cpp
    TimeRulerTests.cpp
    TransportTests.cpp
    VisibleRangeTests.cpp
    VersionTests.cpp)

target_link_libraries(diffuscore_tests PRIVATE
    diffuscore_core
    Catch2::Catch2WithMain)

include(Catch)
catch_discover_tests(diffuscore_tests)

