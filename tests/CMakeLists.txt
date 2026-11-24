add_executable(diffuscore_tests
    AvailableMemoryTests.cpp
    SourceLoadingTests.cpp
    SpectrogramTests.cpp
    VersionTests.cpp)

target_link_libraries(diffuscore_tests PRIVATE
    diffuscore_core
    Catch2::Catch2WithMain)

include(Catch)
catch_discover_tests(diffuscore_tests)

