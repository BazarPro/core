// swift-tools-version: 5.9
import PackageDescription

// The SumUp SDK needs iOS 16, so the app's deployment target is 16 too
let package = Package(
    name: "BazarproCapacitorSumup",
    platforms: [.iOS(.v16)],
    products: [
        .library(
            name: "BazarproCapacitorSumup",
            targets: ["SumUpPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/sumup/sumup-ios-sdk.git", from: "7.2.0")
    ],
    targets: [
        .target(
            name: "SumUpPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "SumUpSDK", package: "sumup-ios-sdk")
            ],
            path: "ios/Sources/SumUpPlugin")
    ]
)
