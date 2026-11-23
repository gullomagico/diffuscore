#pragma once

#include <string_view>

namespace diffuscore
{
/** The DiffuScore version, as set by the CMake project (e.g. "0.1.0"). */
std::string_view version() noexcept;
} // namespace diffuscore
