<?php
// upload.php
$targetDir = __DIR__ . "/games/";

// Ensure directory exists
if (!is_dir($targetDir)) {
    mkdir($targetDir, 0777, true);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['file'])) {
    $fileTmpPath = $_FILES['file']['tmp_name'];
    $fileName = pathinfo($_FILES['file']['name'], PATHINFO_FILENAME);

    $folderName = preg_replace('/[^a-zA-Z0-9_-]/', '', strtolower($fileName));
    $extractPath = $targetDir . $folderName;

    if (!is_dir($extractPath)) {
        mkdir($extractPath, 0777, true);
    }

    $zip = new ZipArchive;
    if ($zip->open($fileTmpPath) === TRUE) {
        $zip->extractTo($extractPath);
        $zip->close();

        $publicUrl = "http://stoxvalue.in/games/$folderName/index.html";
        echo json_encode(["url" => $publicUrl]);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "Failed to unzip file"]);
    }
} else {
    http_response_code(400);
    echo json_encode(["error" => "No file uploaded"]);
}
