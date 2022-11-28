# Build Pipeleine で ECR に build したイメージをデプロイする仕組みを AWS Management Console で構成する手順

このドキュメントでは，BuildPipeline を構成して，
CodeCommit にデプロイしたソースコードから ECR に build したイメージを deploy する仕組みを，
AWS Management Console で構成する手順を説明する．

ECR にデプロイしたイメージは，ECS で実行して動作確認する．

## 構成

CodeCommit → CodePipeline → CodeBuild → ECR → ECS

## 制限

Docker を利用する場合，
CodeBuild のデフォルト環境では Docker Hub の Download Rate Limit (100回/IP/6時間) に引っかかる場合がある．
この場合，事前に Docker Hub アカウントを作成してログインするか，
CodeBuild を NAT インスタンスのある VPC に接続して利用する．

ここでは，事前に NAT インスタンスのある VPC 環境を構築しておく．

## CodeCommit にリポジトリの作成

CodeCommit にリポジトリを作成して，下記のように構成する．
`IMAGE_REPO_NAME1` は，後ほど CodeBuild に環境変数として設定する．

- リポジトリ名: example_2022_1126
- ディレクトリ構造
  - buildspec.yml
  - nginx
    - Dockerfile

buildspec.yml
```yml
version: 0.2
env:
  variables:
    version: "v0.95"
#  secrets-manager:
#    DOCKERHUB_USER: arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:DOCKERHUB_USER-xxxxxx:DOCKERHUB_USER
#    DOCKERHUB_PASS: arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:DOCKERHUB_PASS-xxxxxx:DOCKERHUB_PASS
phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
#      - echo Logging in to Docker Hub
#      - echo $DOCKERHUB_PASS | docker login -u $DOCKERHUB_USER --password-stdin
  build:
    commands:
      - echo Build started on `date`
      - echo Build and Run the Docker image
      - docker build -f nginx/Dockerfile -t $IMAGE_REPO_NAME1:$version nginx/
      - echo docker tag $IMAGE_REPO_NAME1:$version $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME1:$version
      - docker tag $IMAGE_REPO_NAME1:$version $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME1:$version
  post_build:
    commands:
      - echo Build completed on `date`
      - echo Pushing the Docker image
      - docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME1:$version
      - printf '[{"name":"<container-definition>","imageUri":"%s"}]' $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME1:$version > artifacts.json
artifacts:
  files: artifacts.json
```

Dockerfile
```dockerfile
FROM nginx
```

## CodeBuild でビルド環境の構成

1. ビルドプロジェクトの作成
   1. 設定画面に遷移
      [AWS Management Console]
      → [CodeBuild] で検索 & クリック
      → [ビルドプロジェクトを作成する]
   2. 設定
      - プロジェクトの設定
        - プロジェクト名: example_2022_1126
      - ソース
        - ソースプロバイダ: AWS CodeCommit
        - リポジトリ: example_2022_1126
        - リファレンスタイプ
          - ◉ ブランチ
          - ○ Gitタグ
          - ○ コミットID
        - ブランチ
          - master
        - 追加設定
          - Git のクローンの深さ - オプショナル
            - Full
      - 環境
        - 環境イメージ: マネージド型イメージ
        - オペレーティングシステム: Amazon Linux2
        - ランタイム: Standard
        - イメージ: aws/codebuild/amazonlinux2-x86_64-standard:4.0 (一番新しいものを選択する)
        - イメージのバージョン: このラインタイプバージョンには常に最新のイメージを使用してください
        - 環境タイプ: Linux
        - 特権付与: ✅ Docker イメージを構築するか，ビルドで昇格されたアクセス件を取得するには，このフラグを有効にします
        - サービスロール: 新しいサービスロール
        - ロール名: codebuild-example_2022_1126-service-role (自動入力)
        - 追加設定
          - VPC: 空欄 (Docker Hub の IP 制限に抵触する場合は，NAT 付きの subnet のある VPC を割り当てる)
          - 環境変数
            - 名前: AWS_ACCOUNT_ID, 値: 012345678901, タイプ: プレーンテキスト
            - 名前: AWS_DEFAULT_REGION, 値: ap-northeast-1, タイプ: プレーンテキスト
            - 名前: IMAGE_REPO_NAME1, 値: example_2022_1126, タイプ: プレーンテキスト
      - Buildspec:
        - ビルド使用
          - ◉ buildspce ファイルを使用する
          - Buildspec 名 - オプショナル
2. ビルドプロジェクトが使うIAM Roleの設定
   1. 設定画面に遷移
      [AWS Management Console]
      → [IAM] で検索 & クリック
      → [ロール (サイドバー)]
      → ＜codebuild-example_2022_1126-service-role＞ で検索
      → アタッチされている [ポリシー]＜CodeBuildBasePolicy-example_2022_1126-ap-northeast-1＞ をクリック
      → [ポリシーの編集]
   2. 設定
      - 下記のポリシーを追記する

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:GetRepositoryPolicy",
                "ecr:DescribeRepositories",
                "ecr:ListImages",
                "ecr:DescribeImages",
                "ecr:BatchGetImage",
                "ecr:GetLifecyclePolicy",
                "ecr:GetLifecyclePolicyPreview",
                "ecr:ListTagsForResource",
                "ecr:DescribeImageScanFindings"
            ],
            "Resource": "*"
        }
    ]
}
```

- 参考:
  - [Amazon Elastic Container Registry のアイデンティティベースのポリシーの例](https://docs.aws.amazon.com/ja_jp/AmazonECR/latest/userguide/security_iam_id-based-policy-examples.html)

## ECR に Docker リポジトリの作成

1. ECR に Docker リポジトリの作成
   1. 設定画面に遷移
      [AWS Management Console]
      → [ECR] で検索 & クリック
      → [リポジトリを作成]
   2. 設定
      - 一般設定
        - 可視性設定
          - ◉ プライベート
          - ○ パブリック
        - リポジトリ名: example_2022_1126
      - ソース
        - ソースプロバイダ: AWS CodeCommit
2. リポジトリポリシーの設定
   CodeBuild の実行 role から ECR リポジトリを操作できるように，
   ECR リポジトリのポリシーで，CodeBuild の実行 role に ECR の操作を許可する．
   1. 設定画面に遷移
      [AWS Management Console]
      → [ECR] で検索 & クリック
      → ◉ ＜example_2022_1126＞ (当該リポジトリ名をクリック)
      → [アクション] → [表示 / 許可]
      → [ポリシー JSON の編集]
   2. 設定

```json
{
  "Version": "2008-10-17",
  "Statement": [
    {
      "Sid": "new statement",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::012345678901:role/service-role/codebuild-example_2022_1126-service-role"
      },
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:GetAuthorizationToken",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ]
    }
  ]
}
```

## CodePipeline の構成

1. CodePipeline の作成
   1. 設定画面に遷移
      [AWS Management Console]
      → [CodePipeline] で検索 & クリック
      → [パイプラインを作成する]
   2. 設定
      - パイプラインの設定
        - パイプライン名: exapmle_2022_1126
        - サービスロール
          - ◉ 新しいサービスロール
          - ○ 既存のサービスロール
        - ロール名: [自動入力のまま]
      - ソース
        - AWS CodeCommit
        - リポジトリ名: exapmle_2022_1126
        - ブランチ名: master
        - 検出オプションを変更する
          - ◉ Amazon CloudWatch Events (推奨)
          - ○ AWS CodePipeline
        - 出力アーティファクト形式
          - ◉ CodePipeline のデフォルト (zip 形式．git メタデータを含まず)
          - ○ 完全クローン
      - ビルドステージを追加する
        - プロバイダーを構築する: AWS CodeBuild
        - リージョン: アジアパシフィック (東京)
        - プロジェクト名: example_2022_1126
        - ビルドタイプ: 単一ビルド
      - デプロイステージを追加する
        - [導入段階をスキップ] をクリック
2. CodePipeline が使うIAM Roleの設定
   1. 設定画面に遷移
      [AWS Management Console]
      → [IAM] で検索 & クリック
      → [ロール (サイドバー)]
      → ＜AWSCodePipelineServiceRole-ap-northeast-1-exapmle_2022_1126＞ で検索
      → アタッチされている [ポリシー]＜AWSCodePipelineServiceRole-ap-northeast-1-exapmle_2022_1126＞ をクリック
      → [ポリシーの編集]
   2. 設定
      - assume role できるように，下記のポリシーを追記する

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AssumeRolePolicy",
            "Effect": "Allow",
            "Action": "sts:AssumeRole",
            "Resource": [
                  "arn:aws:iam::012345678901:role/service-role/AWSCodePipelineServiceRole-ap-northeast-1-exapmle_2022_1126"
            ]
        }
    ]
}
```

## ECS の構成手順


## 動作確認

1. CodeBuild の動作確認
   Git リポジトリ，ECR リポジトリ，CodeBuild が構成できた段階で，
   CodeBuild の「ビルドを開始」ボタンを押して，ビルドできることを確認する．
2. CodePipeline の動作確認
   Git リポジトリの master branch を編集して，push する．

## 参考

- [CodeCommit のリポジトリに Dockerfile をpush すると CodeBuild が docker build して コンテナイメージを作成し ECR のリポジトリに push する仕組みの構築方法 (docker build の自動化)](https://blog.serverworks.co.jp/dockerbuild)
- [“Too Many Requests.” でビルドが失敗する…。AWS CodeBuild で IP ガチャを回避するために Docker Hub ログインしよう！という話](https://dev.classmethod.jp/articles/codebuild-has-to-use-dockerhub-login-to-avoid-ip-gacha/)
